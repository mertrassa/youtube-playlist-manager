/*
 * Playlist page (/playlist?list=…): a toolbar above the video list with
 *   stats (length, watched, time left) · search · filters · sort · play shown order ·
 *   continue (first unwatched) · export (CSV / JSON / links).
 *
 * Sorting/filtering never touches YouTube's data: rows get a CSS `order` or are hidden.
 */
(() => {
  const Y = YPM;
  const ITEM_SELECTOR = "ytd-playlist-video-renderer, yt-lockup-view-model";
  const CONTINUATION_SELECTOR = "yt-continuation-item-view-model, ytd-continuation-item-renderer";
  // YouTube loads playlists 100 at a time; hidden unavailable videos make a full page look a bit shorter.
  const PAGE_SIZE = 90;

  const SORTS = {
    index: "Playlist order",
    reverse: "Reversed (last → first)",
    title: "Title A → Z",
    titleDesc: "Title Z → A",
    channel: "Channel A → Z",
    shortest: "Shortest first",
    longest: "Longest first",
    views: "Most viewed",
    newest: "Newest upload",
    oldest: "Oldest upload",
    progress: "Least watched first",
    shuffle: "Shuffle",
  };
  const DURATIONS = {
    any: "Any length",
    short: "Under 5 min",
    medium: "5–20 min",
    long: "20–60 min",
    xlong: "Over 1 hour",
  };
  const STATUSES = {
    all: "Any status",
    unwatched: "Unwatched",
    progress: "In progress",
    watched: "Watched",
    duplicates: "Duplicates",
  };
  const DEFAULT_VIEW = { q: "", sort: "index", dur: "any", status: "all", channel: "" };

  let view = { ...DEFAULT_VIEW };
  let viewList = null; // list the view belongs to
  let shuffleKey = new Map();
  let loading = false;
  let fullyLoaded = false;
  let lastApplied = ""; // signature of the last applied view, to avoid redundant DOM work

  const root = () =>
    document.querySelector('ytd-browse[page-subtype="playlist"]:not([hidden])') ||
    document.querySelector("ytd-browse:not([hidden])");

  /* ------------------------------------------------------------------ */
  /* Reading rows                                                        */
  /* ------------------------------------------------------------------ */

  function videoLinks(r, list) {
    const seen = new Map(); // index -> link (first one per row)
    for (const a of r.querySelectorAll('a[href*="/watch?"]')) {
      if (!a.closest(ITEM_SELECTOR)) continue; // skip header links such as "Play all"
      const { v, index, list: l } = Y.parseHref(a.getAttribute("href"));
      if (l !== list || !v || !Number.isFinite(index) || seen.has(index)) continue;
      seen.set(index, a);
    }
    return seen;
  }

  /** The element whose children are the video rows. */
  function findContainer(links) {
    const arr = [...links.values()];
    if (arr.length < 2) {
      const only = arr[0]?.closest(ITEM_SELECTOR);
      return only?.parentElement?.id === "contents" ? only.parentElement : only?.parentElement?.parentElement || null;
    }
    const first = arr[0].closest(ITEM_SELECTOR) || arr[0];
    const last = arr[arr.length - 1].closest(ITEM_SELECTOR) || arr[arr.length - 1];
    let node = first.parentElement;
    while (node && !node.contains(last)) node = node.parentElement;
    return node;
  }

  function rowOf(container, el) {
    let node = el;
    while (node && node.parentElement !== container) node = node.parentElement;
    return node;
  }

  function ytProgress(item) {
    // Red "resume" bar on the thumbnail (only present when signed in).
    const bar = item.querySelector(
      '[class*="ProgressBar" i] [style*="width"], #progress[style*="width"], [class*="resume" i] [style*="width"]'
    );
    const w = bar && parseFloat(bar.style.width);
    return Number.isFinite(w) ? w / 100 : 0;
  }

  function readRow(container, a, index) {
    const item = a.closest(ITEM_SELECTOR) || a;
    const v = Y.parseHref(a.getAttribute("href")).v;
    const title =
      item.querySelector("#video-title, a.ytLockupMetadataViewModelTitle, h3 a, h3")?.textContent.trim() ||
      a.getAttribute("title") ||
      "";
    const channelEl = item.querySelector(
      'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], ytd-channel-name a'
    );
    const channel = channelEl?.textContent.trim() || "";
    let d = null;
    for (const b of item.querySelectorAll(
      ".ytBadgeShapeText, badge-shape, ytd-thumbnail-overlay-time-status-renderer, #time-status"
    )) {
      d = Y.parseClock(b.textContent);
      if (d != null) break;
    }
    if (d == null) d = Y.videos[v]?.d ?? null;
    // Metadata texts: views and upload age, in whatever order the layout gives them.
    let views = null;
    let age = null;
    for (const t of item.querySelectorAll(
      ".ytContentMetadataViewModelMetadataText, #video-info span, #metadata-line span, yt-formatted-string#video-info span"
    )) {
      const s = t.textContent.trim();
      if (age == null && /\d/.test(s) && /ago|\b\d+\s*(y|mo|w|d|h)\b/i.test(s)) age = Y.parseAge(s);
      else if (views == null && /^[\d.,]+\s*[KMB]?\b/i.test(s)) views = Y.parseCount(s);
    }
    const ytP = ytProgress(item);
    if (d) Y.recordVideo(v, { d, p: ytP || undefined });
    return { v, index, a, row: rowOf(container, item), title, channel, d, views, age, ytP };
  }

  function scan() {
    const r = root();
    const list = Y.listId();
    if (!r || !list) return null;
    const links = videoLinks(r, list);
    const container = findContainer(links);
    if (!container) return null;
    const rows = [...links.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([index, a]) => readRow(container, a, index))
      .filter((row) => row.row);
    const counts = new Map();
    rows.forEach((row) => counts.set(row.v, (counts.get(row.v) || 0) + 1));
    rows.forEach((row) => (row.dupe = counts.get(row.v) > 1));
    return { root: r, list, container, rows };
  }

  /**
   * How many videos YouTube says the playlist has ("653 videos"), minus any it says are
   * hidden as unavailable. null when unknown or abbreviated ("1.2K videos").
   */
  function expectedCount(r) {
    const header = [...r.querySelectorAll("yt-page-header-view-model, ytd-playlist-header-renderer, ytd-playlist-byline-renderer")]
      .find(Y.isVisible);
    const m = header?.innerText.match(/(\d[\d,.\s]*)\s*(K|M)?\s+videos?\b/i);
    if (!m || m[2]) return null;
    const total = parseInt(m[1].replace(/\D/g, ""), 10);
    const alerts = r.querySelector("#alerts")?.textContent || "";
    const hidden = parseInt(alerts.match(/(\d+)\s+unavailable videos? (?:are|is) hidden/i)?.[1] || "0", 10);
    return Number.isFinite(total) ? total - hidden : null;
  }

  /** Scroll until every video is loaded (or YouTube stops adding more). */
  async function loadAll(onProgress) {
    if (loading) return;
    loading = true;
    try {
      const r = root();
      const list = Y.listId();
      const startY = window.scrollY;
      const expected = expectedCount(r);
      // Temporarily show YouTube's own order, otherwise the "load more" trigger may sit off-screen.
      const container = scan()?.container;
      container?.classList.remove("ypm-sorted");
      let count = -1;
      let lastGrowth = Date.now();
      // Each page of 100 can take several seconds to arrive, so be patient before giving up.
      while (Date.now() - lastGrowth < 12000 && Y.listId() === list) {
        const n = videoLinks(r, list).size;
        if (n !== count) {
          count = n;
          lastGrowth = Date.now();
          onProgress?.(expected ? `${n} / ${expected}` : n);
        }
        if (expected && n >= expected) break;
        const cont = [...r.querySelectorAll(CONTINUATION_SELECTOR)].pop();
        cont?.scrollIntoView({ block: "end" });
        window.scrollTo(0, document.documentElement.scrollHeight);
        await Y.sleep(400);
      }
      window.scrollTo(0, startY);
      fullyLoaded = true;
    } finally {
      loading = false;
      lastApplied = "";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Filtering & sorting                                                 */
  /* ------------------------------------------------------------------ */

  const isDefaultView = () =>
    view.sort === "index" && !view.q && view.dur === "any" && view.status === "all" && !view.channel;
  const hasFilters = () => !!view.q || view.dur !== "any" || view.status !== "all" || !!view.channel;

  function matches(row) {
    if (view.q) {
      const q = view.q.toLowerCase();
      if (!row.title.toLowerCase().includes(q) && !row.channel.toLowerCase().includes(q)) return false;
    }
    if (view.channel && row.channel !== view.channel) return false;
    if (view.dur !== "any") {
      const m = (row.d ?? -1) / 60;
      if (row.d == null) return false;
      if (view.dur === "short" && !(m < 5)) return false;
      if (view.dur === "medium" && !(m >= 5 && m < 20)) return false;
      if (view.dur === "long" && !(m >= 20 && m < 60)) return false;
      if (view.dur === "xlong" && !(m >= 60)) return false;
    }
    const f = Y.watchedFraction(row.v, row.ytP);
    const watched = Y.isWatched(row.v, row.ytP);
    if (view.status === "unwatched" && f > 0.02) return false;
    if (view.status === "progress" && !(f > 0.02 && !watched)) return false;
    if (view.status === "watched" && !watched) return false;
    if (view.status === "duplicates" && !row.dupe) return false;
    return true;
  }

  function sortRows(rows) {
    const by = (key, dir = 1, missing = Infinity) => (a, b) => {
      const x = a[key] ?? missing;
      const y = b[key] ?? missing;
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.index - b.index;
    };
    const text = (key, dir = 1) => (a, b) => a[key].localeCompare(b[key], undefined, { sensitivity: "base" }) * dir || a.index - b.index;
    const cmp = {
      index: by("index"),
      reverse: by("index", -1),
      title: text("title"),
      titleDesc: text("title", -1),
      channel: text("channel"),
      shortest: by("d", 1, Infinity),
      longest: (a, b) => (b.d ?? -1) - (a.d ?? -1) || a.index - b.index,
      views: (a, b) => (b.views ?? -1) - (a.views ?? -1) || a.index - b.index,
      newest: by("age", 1, Infinity),
      oldest: (a, b) => (b.age ?? -1) - (a.age ?? -1) || a.index - b.index,
      progress: (a, b) => Y.watchedFraction(a.v, a.ytP) - Y.watchedFraction(b.v, b.ytP) || a.index - b.index,
      shuffle: (a, b) => {
        for (const r of [a, b]) if (!shuffleKey.has(r.v)) shuffleKey.set(r.v, Math.random());
        return shuffleKey.get(a.v) - shuffleKey.get(b.v);
      },
    }[view.sort];
    return [...rows].sort(cmp);
  }

  /** Rows that pass the filters, in display order. */
  function shownRows(data) {
    return sortRows(data.rows.filter(matches));
  }

  function applyView(data) {
    const { container, rows } = data;
    if (isDefaultView()) {
      if (container.classList.contains("ypm-sorted")) {
        container.classList.remove("ypm-sorted");
        for (const row of rows) {
          row.row.style.order = "";
          row.row.classList.remove("ypm-hidden");
        }
      }
      return rows;
    }
    container.classList.add("ypm-sorted");
    const shown = shownRows(data);
    const pos = new Map(shown.map((r, i) => [r.row, i]));
    const rowEls = new Set(rows.map((r) => r.row));
    for (const child of container.children) {
      const p = pos.get(child);
      const isRow = rowEls.has(child);
      const order = p != null ? String(p) : isRow ? "" : "999999"; // keep "load more"/notices last
      if (child.style.order !== order) child.style.order = order;
      child.classList.toggle("ypm-hidden", isRow && p == null);
    }
    return shown;
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  function describeView() {
    const bits = [];
    if (view.sort !== "index") bits.push(SORTS[view.sort]);
    if (view.q) bits.push(`“${view.q}”`);
    if (view.channel) bits.push(view.channel);
    if (view.dur !== "any") bits.push(DURATIONS[view.dur]);
    if (view.status !== "all") bits.push(STATUSES[view.status]);
    return bits.join(", ") || "Playlist order";
  }

  async function ensureLoaded(label) {
    if (fullyLoaded || loading) return;
    const data = scan();
    if (data && data.rows.length < PAGE_SIZE) {
      fullyLoaded = true; // everything fits on the first page
      return;
    }
    await loadAll((n) => setStatus(`${label || "Loading videos"}… ${n}`));
    setStatus("");
  }

  /** Play the shown videos in the shown order. fromUnwatched: start at the first unwatched one. */
  async function play({ fromUnwatched = false } = {}) {
    await ensureLoaded("Loading the whole playlist");
    const data = scan();
    if (!data) return;
    const shown = isDefaultView() ? data.rows : shownRows(data);
    const ids = [...new Set(shown.map((r) => r.v))];
    if (!ids.length) return Y.toast("No videos match the current filters.");

    let start = shown[0];
    if (fromUnwatched) {
      start = shown.find((r) => !Y.isWatched(r.v, r.ytP) && Y.watchedFraction(r.v, r.ytP) < 0.98);
      if (!start) return Y.toast("You've watched everything shown here. 🎉");
    }

    if (!hasFilters() && view.sort === "index") Y.setMode(data.list, null);
    else if (!hasFilters() && view.sort === "reverse") {
      // Keep the full order so the watch page can show position/time left for long playlists.
      Y.setMode(data.list, { mode: "reverse", ids: [...new Set(data.rows.map((r) => r.v))] });
    }
    else Y.setMode(data.list, { mode: "queue", ids, label: describeView() });
    start.a.click(); // YouTube's in-app navigation to the watch page
  }

  function exportRows(kind) {
    const data = scan();
    if (!data) return;
    const rows = isDefaultView() ? data.rows : shownRows(data);
    const url = (r) => `https://www.youtube.com/watch?v=${r.v}`;
    const name = (document.title.replace(/ - YouTube$/, "") || data.list).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
    const pct = (r) => Math.round(Y.watchedFraction(r.v, r.ytP) * 100);

    if (kind === "links") {
      const text = rows.map(url).join("\n");
      navigator.clipboard.writeText(text).then(
        () => Y.toast(`Copied ${rows.length} links.`),
        () => Y.toast("Couldn't access the clipboard.")
      );
      return;
    }
    let blob;
    if (kind === "csv") {
      const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const lines = [["position", "title", "channel", "duration", "seconds", "watched_percent", "url"].join(",")];
      for (const r of rows) {
        lines.push([r.index, esc(r.title), esc(r.channel), r.d != null ? Y.formatDuration(r.d) : "", r.d ?? "", pct(r), url(r)].join(","));
      }
      blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    } else {
      const json = {
        playlist: data.list,
        title: name,
        exported: new Date().toISOString(),
        view: describeView(),
        videos: rows.map((r) => ({
          position: r.index,
          id: r.v,
          title: r.title,
          channel: r.channel,
          seconds: r.d,
          watchedPercent: pct(r),
          url: url(r),
        })),
      };
      blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    }
    const a = Y.el("a", { href: URL.createObjectURL(blob), download: `${name}.${kind}` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    Y.toast(`Exported ${rows.length} videos.`);
  }

  /* ------------------------------------------------------------------ */
  /* Toolbar                                                             */
  /* ------------------------------------------------------------------ */

  let toolbar = null;

  const options = (map, selected) =>
    Object.entries(map).map(([value, label]) => Y.el("option", { value, selected: value === selected }, label));

  function setStatus(text) {
    if (toolbar) Y.setText(toolbar.querySelector(".ypm-status"), text);
  }

  function buildToolbar() {
    const onViewChange = async (patch) => {
      Object.assign(view, patch);
      if (patch.sort === "shuffle") shuffleKey = new Map();
      await ensureLoaded();
      lastApplied = "";
      YPM.ensurePlaylistUI();
    };

    let searchTimer = 0;
    const search = Y.el("input", {
      type: "search",
      className: "ypm-input ypm-search",
      placeholder: "Search title or channel",
      "aria-label": "Search this playlist",
      oninput: (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => onViewChange({ q: e.target.value.trim() }), 200);
      },
    });
    const select = (cls, label, map, key) =>
      Y.el("select", { className: `ypm-input ${cls}`, "aria-label": label, onchange: (e) => onViewChange({ [key]: e.target.value }) }, options(map, view[key]));

    const exportMenu = Y.el(
      "details",
      { className: "ypm-menu" },
      Y.el("summary", { className: "ypm-btn" }, Y.el("span", { className: "ypm-icon", "aria-hidden": "true" }, "⤓"), Y.el("span", { className: "ypm-label" }, "Export")),
      Y.el(
        "div",
        { className: "ypm-menu-list" },
        Y.button("", "CSV spreadsheet", () => exportRows("csv")),
        Y.button("", "JSON", () => exportRows("json")),
        Y.button("", "Copy links", () => exportRows("links"))
      )
    );
    exportMenu.addEventListener("click", (e) => {
      if (e.target.closest(".ypm-menu-list")) exportMenu.open = false;
    });

    const speed = Y.el(
      "select",
      {
        className: "ypm-input ypm-speed",
        "aria-label": "Playback speed for time left",
        title: "Playback speed used to calculate time left",
        onchange: (e) => Y.setSetting("speed", parseFloat(e.target.value)),
      },
      [1, 1.25, 1.5, 1.75, 2].map((s) => Y.el("option", { value: String(s), selected: s === Y.settings.speed }, `${s}×`))
    );

    const bar = Y.el(
      "div",
      { className: "ypm-toolbar", role: "region", "aria-label": "Playlist manager" },
      Y.el("div", { className: "ypm-row ypm-stats" }, Y.el("span", { className: "ypm-stats-text" }), Y.el("span", { className: "ypm-at" }, "at"), speed),
      Y.el(
        "div",
        { className: "ypm-row ypm-controls" },
        search,
        select("ypm-sort", "Sort", SORTS, "sort"),
        select("ypm-dur", "Length", DURATIONS, "dur"),
        select("ypm-status-filter", "Watch status", STATUSES, "status"),
        Y.el("select", { className: "ypm-input ypm-channel", "aria-label": "Channel", onchange: (e) => onViewChange({ channel: e.target.value }) })
      ),
      Y.el(
        "div",
        { className: "ypm-row ypm-actions" },
        Y.button("▶", "Play shown", () => play(), { className: "ypm-primary", title: "Play the videos shown below, in this order" }),
        Y.button("↪", "Continue", () => play({ fromUnwatched: true }), { title: "Play from the first unwatched video in this order" }),
        exportMenu,
        Y.button("↺", "Reset", () => {
          view = { ...DEFAULT_VIEW };
          for (const s of bar.querySelectorAll("select:not(.ypm-speed)")) s.selectedIndex = 0;
          search.value = "";
          lastApplied = "";
          YPM.ensurePlaylistUI();
        }, { className: "ypm-reset", title: "Back to YouTube's order, no filters" }),
        Y.button("⇣", "Load all", async (b) => {
          b.disabled = true;
          await loadAll((n) => setStatus(`Loading videos… ${n}`));
          setStatus("");
          b.disabled = false;
          YPM.ensurePlaylistUI();
        }, { className: "ypm-loadall", title: "Load every video so stats, search and sorting cover the whole playlist" }),
        Y.el("span", { className: "ypm-status", role: "status" }),
        Y.el("span", { className: "ypm-count" })
      )
    );
    // Don't let YouTube's global keyboard shortcuts fire while typing in our controls.
    bar.addEventListener("keydown", (e) => e.stopPropagation());
    return bar;
  }

  function updateChannels(rows) {
    const sel = toolbar.querySelector(".ypm-channel");
    const names = [...new Set(rows.map((r) => r.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const sig = names.join("\n");
    if (sel.dataset.sig === sig) return;
    sel.dataset.sig = sig;
    sel.replaceChildren(
      Y.el("option", { value: "" }, `All channels (${names.length})`),
      ...names.map((n) => Y.el("option", { value: n, selected: n === view.channel }, n))
    );
  }

  function updateStats(data, shown) {
    const rows = data.rows;
    let total = 0;
    let left = 0;
    let unknown = 0;
    let watched = 0;
    for (const r of rows) {
      const f = Y.watchedFraction(r.v, r.ytP);
      if (Y.isWatched(r.v, r.ytP)) watched++;
      if (r.d == null) {
        unknown++;
        continue;
      }
      total += r.d;
      left += Y.isWatched(r.v, r.ytP) ? 0 : r.d * (1 - f);
    }
    const pct = rows.length ? Math.round((watched / rows.length) * 100) : 0;
    const approx = unknown ? "≈ " : "";
    const partial = !fullyLoaded && rows.length >= PAGE_SIZE;
    const count = partial ? (data.expected ? `${rows.length} of ${data.expected}` : `${rows.length}+`) : rows.length;
    Y.setText(
      toolbar.querySelector(".ypm-stats-text"),
      `${count} videos${partial ? " loaded" : ""} ·${approx}${Y.formatDuration(total)} total · ${watched} watched (${pct}%) · ${approx}${Y.formatDuration(left / (Y.settings.speed || 1))} left`
    );
    const speedSel = toolbar.querySelector(".ypm-speed");
    if (speedSel.value !== String(Y.settings.speed)) speedSel.value = String(Y.settings.speed);
    Y.setText(toolbar.querySelector(".ypm-count"), isDefaultView() ? "" : `Showing ${shown.length} of ${rows.length}`);
    toolbar.querySelector(".ypm-loadall").hidden = fullyLoaded || rows.length < PAGE_SIZE;
    toolbar.querySelector(".ypm-reset").hidden = isDefaultView();
  }

  /** Where to put the toolbar: above the list column. */
  function placeToolbar(container) {
    const host = container.closest("#primary") || container.parentElement;
    if (toolbar.parentElement !== host || host.firstElementChild !== toolbar) host.prepend(toolbar);
  }

  /* --- Hash commands from the channel buttons, e.g. #ypm=reverse --- */
  async function runHashCommand() {
    const m = location.hash.match(/ypm=(\w+)/);
    if (!m || loading) return;
    history.replaceState(history.state, "", location.pathname + location.search);
    if (m[1] === "reverse") {
      view = { ...DEFAULT_VIEW, sort: "reverse" };
      const sortSel = toolbar?.querySelector(".ypm-sort");
      if (sortSel) sortSel.value = "reverse";
      Y.toast("Loading the whole playlist to start from the oldest video…");
      await play();
    }
  }

  YPM.ensurePlaylistUI = () => {
    const list = Y.listId();
    if (!Y.isPlaylistPage() || !Y.isManagedList(list)) {
      toolbar?.remove();
      return;
    }
    if (viewList !== list) {
      viewList = list;
      view = { ...DEFAULT_VIEW };
      fullyLoaded = false;
      lastApplied = "";
      toolbar?.remove();
      toolbar = null;
    }
    const data = scan();
    if (!data || !data.rows.length) return;
    if (!toolbar) toolbar = buildToolbar();
    placeToolbar(data.container);
    data.expected = expectedCount(data.root);
    if (!loading && (data.rows.length < PAGE_SIZE || (data.expected && data.rows.length >= data.expected))) {
      fullyLoaded = true;
    }

    updateChannels(data.rows);
    const sig = JSON.stringify(view) + data.rows.length + ":" + Y.settings.watchedThreshold;
    let shown;
    if (sig !== lastApplied && !loading) {
      lastApplied = sig;
      shown = applyView(data);
    } else {
      shown = isDefaultView() ? data.rows : shownRows(data);
    }
    updateStats(data, shown);
    if (location.hash.includes("ypm=")) runHashCommand();
  };
})();
