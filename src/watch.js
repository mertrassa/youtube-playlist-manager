/*
 * Watch page (/watch?v=…&list=…): custom play order, skip-watched, playlist progress,
 * and local watch-progress tracking.
 *
 * Play modes (per playlist, remembered):
 *   normal  – YouTube's order (we only step in to skip watched videos, if enabled)
 *   reverse – last → first
 *   queue   – an explicit list of video IDs, created on the playlist page from a sort/filter
 */
(() => {
  const Y = YPM;

  /* ------------------------------------------------------------------ */
  /* Playlist panel                                                      */
  /* ------------------------------------------------------------------ */

  const getPanels = () => [...document.querySelectorAll("ytd-playlist-panel-renderer")];
  // The panel can live in #secondary (wide) or #below (narrow layout); prefer the visible one.
  const activePanel = () => {
    const panels = getPanels();
    return panels.find(Y.isVisible) || panels.find((p) => p.querySelector("#items > *")) || null;
  };
  const panelItems = (panel) =>
    panel ? [...panel.querySelectorAll("#items > ytd-playlist-panel-video-renderer")] : [];

  function itemInfo(item) {
    const a = item.querySelector("a#wc-endpoint") || item.querySelector("a[href*='/watch']");
    const v = Y.parseHref(a?.href).v;
    const title = item.querySelector("#video-title");
    const d = Y.parseSpokenDuration(title?.getAttribute("aria-label")) || Y.videos[v]?.d || null;
    if (v && d && !Y.videos[v]?.d) Y.recordVideo(v, { d });
    return { v, a, item, d };
  }

  // YouTube's loop button cycles off → loop playlist → loop video, and its label names the
  // *next* action: "Loop video" is shown while the whole playlist is looping.
  const playlistLoopOn = (panel = activePanel()) => {
    const btn = panel?.querySelector("ytd-playlist-loop-button-renderer button, ytd-playlist-loop-button-renderer [aria-label]");
    const label = btn?.getAttribute("aria-label") || "";
    return /loop video/i.test(label) || btn?.getAttribute("aria-pressed") === "true";
  };

  /**
   * Videos in the order they will be played under the current mode.
   * order.full is true when it covers the whole playlist (not just the panel's window —
   * YouTube only renders ~20–200 items around the current video for long playlists).
   */
  function playOrder() {
    const mode = Y.getMode();
    const items = panelItems(activePanel()).map(itemInfo).filter((i) => i.v);
    const byId = new Map(items.map((i) => [i.v, i]));
    const fromIds = (ids) => {
      const order = ids.map((v) => byId.get(v) || { v, d: Y.videos[v]?.d || null });
      order.full = true;
      return order;
    };
    if (mode?.mode === "queue") return fromIds(mode.ids);
    if (mode?.mode === "reverse") {
      // A full ID list is saved when reverse play starts from the playlist page. If the playlist
      // has changed since (current video missing from it), fall back to the panel.
      if (mode.ids?.includes(Y.videoId())) return fromIds([...mode.ids].reverse());
      return items.reverse();
    }
    return items;
  }

  /** YouTube's own "12 / 653" position counter in the panel header. */
  function panelCounter(panel) {
    // The counter is rendered twice (one copy hidden), so read a single element, not the container.
    const els = [...(panel?.querySelectorAll(".index-message") || [])];
    for (const el of [...els.filter(Y.isVisible), ...els]) {
      const m = el.textContent.trim().match(/^(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)$/);
      if (m) return { pos: parseInt(m[1].replace(/\D/g, ""), 10), total: parseInt(m[2].replace(/\D/g, ""), 10) };
    }
    return null;
  }

  const controllerActive = () =>
    Y.isWatchPage() && Y.isManagedList() && (!!Y.getMode() || Y.settings.skipWatched);

  /**
   * Work out where a step (+1 next / -1 previous) should go.
   * Returns { target } | { end: true } | { native: true } (let YouTube handle it).
   */
  function resolveStep(step) {
    const order = playOrder();
    const cur = order.findIndex((o) => o.v === Y.videoId());
    if (cur < 0) return { native: true }; // current video isn't part of our order
    const n = order.length;
    const loop = playlistLoopOn();
    for (let k = 1; k < n; k++) {
      let i = cur + step * k;
      if (i < 0 || i >= n) {
        if (!loop) return { end: true };
        i = ((i % n) + n) % n;
      }
      const o = order[i];
      if (step > 0 && Y.settings.skipWatched && Y.isWatched(o.v)) continue;
      // In normal mode, if the target is simply YouTube's own next/previous, don't interfere.
      if (!Y.getMode() && k === 1 && !(loop && (cur + step < 0 || cur + step >= n))) return { native: true };
      return { target: o };
    }
    return { end: true };
  }

  function navigateTo(o) {
    if (o.a && o.a.isConnected) o.a.click(); // in-app navigation, same as clicking the panel
    else location.assign(`/watch?v=${encodeURIComponent(o.v)}&list=${encodeURIComponent(Y.listId())}`);
  }

  /** Returns true if we took over the navigation. */
  function step(dir, { auto = false } = {}) {
    if (!controllerActive()) return false;
    const r = resolveStep(dir);
    if (r.native) return false;
    if (r.end) {
      if (auto) {
        Y.toast(Y.settings.skipWatched ? "No unwatched videos left in this play order." : "End of the playlist.");
      } else {
        Y.toast(dir > 0 ? "This is the last video in the play order." : "This is the first video in the play order.");
      }
      return true; // swallow the click; there's nowhere to go
    }
    navigateTo(r.target);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Video events: progress tracking + auto-advance                       */
  /* ------------------------------------------------------------------ */

  let armed = true; // re-armed once the video is seen playing away from its end
  let navAt = 0;
  let lastRecord = 0;
  let lastUiUpdate = 0;

  function mainVideo(target) {
    if (!(target instanceof HTMLVideoElement) || !target.classList.contains("html5-main-video")) return null;
    const player = target.closest("#movie_player");
    if (!player || player.classList.contains("ad-showing")) return null;
    return target;
  }

  function onTimeUpdate(e) {
    const video = mainVideo(e.target);
    if (!video || !Y.isWatchPage()) return;
    const { duration, currentTime, playbackRate } = video;
    if (!isFinite(duration) || duration < 1) return;
    const now = Date.now();
    const settled = now - navAt > 2500; // ignore the old video's last frames right after navigation

    if (Y.settings.trackProgress && settled && now - lastRecord > 5000) {
      lastRecord = now;
      Y.recordVideo(Y.videoId(), { p: currentTime / duration, d: duration });
    }
    if (now - lastUiUpdate > 1000) {
      lastUiUpdate = now;
      updateProgressLine(video);
    }

    if (!controllerActive() || video.loop || !settled) return;
    // timeupdate fires ~4x/sec; leave headroom at higher speeds so we beat YouTube's autoplay.
    const threshold = 0.4 + 0.3 * (playbackRate || 1);
    const remaining = duration - currentTime;
    if (remaining > threshold + 1) {
      armed = true;
      return;
    }
    if (!armed || remaining > threshold) return;
    armed = false;
    const r = resolveStep(+1);
    if (r.native) return; // YouTube's own autoplay goes to the right place
    video.pause();
    if (Y.settings.trackProgress) Y.recordVideo(Y.videoId(), { p: 1, d: duration });
    step(+1, { auto: true });
  }

  function onEnded(e) {
    const video = mainVideo(e.target);
    if (video && Y.settings.trackProgress && Date.now() - navAt > 2500) {
      Y.recordVideo(Y.videoId(), { p: 1, d: video.duration });
    }
  }

  // Media events don't bubble, but capturing listeners on document still receive them.
  document.addEventListener("timeupdate", onTimeUpdate, true);
  document.addEventListener("ended", onEnded, true);
  document.addEventListener("yt-navigate-finish", () => {
    armed = true;
    navAt = Date.now();
  });

  /* --- Next / Previous buttons and Shift+N / Shift+P --- */

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.(".ytp-next-button, .ytp-prev-button");
      if (!btn || !controllerActive()) return;
      if (step(btn.classList.contains("ytp-next-button") ? +1 : -1)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !controllerActive()) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const key = e.key.toLowerCase();
      if (key !== "n" && key !== "p") return;
      if (step(key === "n" ? +1 : -1)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  /* ------------------------------------------------------------------ */
  /* Panel UI                                                            */
  /* ------------------------------------------------------------------ */

  function buildBar() {
    const bar = Y.el("div", { className: "ypm-bar" });
    const buttons = Y.el(
      "div",
      { className: "ypm-bar-row" },
      Y.button("⇅", "Reverse", () => Y.setMode(Y.listId(), Y.getMode()?.mode === "reverse" ? null : { mode: "reverse" }), {
        className: "ypm-small ypm-reverse",
        title: "Play this playlist last → first",
      }),
      Y.button("⏭", "Skip watched", () => Y.setSetting("skipWatched", !Y.settings.skipWatched), {
        className: "ypm-small ypm-skip",
        title: "Skip videos you've already watched when moving forward",
      })
    );
    const queueChip = Y.el(
      "div",
      { className: "ypm-chip ypm-queue-chip", hidden: true },
      Y.el("span", { className: "ypm-chip-text" }),
      Y.el("button", {
        type: "button",
        className: "ypm-chip-x",
        title: "Back to the normal playlist order",
        "aria-label": "Clear custom play order",
        onclick: (e) => {
          e.stopPropagation();
          Y.setMode(Y.listId(), null);
        },
      }, "✕")
    );
    const progress = Y.el(
      "div",
      { className: "ypm-progress" },
      Y.el("div", { className: "ypm-progress-text" }),
      Y.el("div", { className: "ypm-progress-track" }, Y.el("div", { className: "ypm-progress-fill" }))
    );
    bar.append(buttons, queueChip, progress);
    // Keep clicks/keys inside our bar from reaching the panel (which collapses on header click).
    bar.addEventListener("click", (e) => e.stopPropagation());
    return bar;
  }

  function updateProgressLine(video = document.querySelector("#movie_player video.html5-main-video")) {
    const panel = activePanel();
    const bar = panel?.querySelector(".ypm-bar");
    if (!bar) return;
    const order = playOrder();
    const cur = order.findIndex((o) => o.v === Y.videoId());
    const text = bar.querySelector(".ypm-progress-text");
    const fill = bar.querySelector(".ypm-progress-fill");
    if (cur < 0 || !order.length) {
      Y.setText(text, Y.getMode()?.mode === "queue" ? "This video isn't in your custom play order." : "");
      fill.style.width = "0%";
      return;
    }
    const curDur = video && isFinite(video.duration) && video.duration > 0 ? video.duration : order[cur].d || 0;
    const curTime = video && isFinite(video.currentTime) ? Math.min(video.currentTime, curDur) : 0;
    let before = 0;
    let after = 0;
    let unknown = 0;
    order.forEach((o, i) => {
      const d = i === cur ? curDur : o.d;
      if (!d) {
        if (i !== cur) unknown++;
        return;
      }
      if (i < cur) before += d;
      else if (i > cur && !(Y.settings.skipWatched && Y.isWatched(o.v))) after += d;
    });
    const total = before + curDur + after;
    const rate = video?.playbackRate || 1;
    const left = (curDur - curTime + after) / rate;
    let pos = cur + 1;
    let count = order.length;
    let approx = unknown > 0;
    const counter = !order.full && panelCounter(panel);
    if (counter && counter.total > order.length) {
      // Only part of a long playlist is in the panel: use YouTube's counter for the position.
      count = counter.total;
      pos = Y.getMode()?.mode === "reverse" ? counter.total - counter.pos + 1 : counter.pos;
      approx = true;
    }
    const parts = [`Video ${pos} of ${count}`, `${approx ? "≈ " : ""}${Y.formatDuration(left)} left`];
    if (rate !== 1) parts[1] += ` at ${rate}×`;
    Y.setText(text, parts.join(" · "));
    const pct = total ? Math.min(100, ((before + curTime) / total) * 100) : 0;
    const w = pct.toFixed(1) + "%";
    if (fill.style.width !== w) fill.style.width = w;
  }

  function applyPanelOrder(panel, mode) {
    const items = panelItems(panel);
    const queue = mode?.mode === "queue" ? new Map(mode.ids.map((v, i) => [v, i])) : null;
    const reverse = mode?.mode === "reverse";
    items.forEach((item, i) => {
      const v = Y.parseHref((item.querySelector("a#wc-endpoint") || item.querySelector("a"))?.href).v;
      const pos = queue ? queue.get(v) : undefined;
      const order = reverse ? String(items.length - i) : queue && pos != null ? String(pos) : "";
      if (item.style.order !== order) item.style.order = order;
      item.classList.toggle("ypm-hidden", !!queue && pos == null);
      item.classList.toggle("ypm-watched", Y.settings.skipWatched && !!v && Y.isWatched(v));
    });
  }

  /*
   * Keep the playing video visible in the panel. After the video or play mode changes, scroll
   * the panel's own scroll box so the current video is in view — the visual order changed, so
   * the spot YouTube scrolled to may now hold a different video. This runs for a few seconds
   * after each change and stops the moment you scroll the panel yourself.
   */
  let centerKey = "";
  let centerUntil = 0;
  let userScrollAt = 0;

  function panelScroller(panel) {
    for (let el = panel.querySelector("#items"); el && el !== panel.parentElement; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
    }
    return null; // narrow layout: the panel isn't a scroll box, leave the page alone
  }

  function keepCurrentInView(panel, mode) {
    if (!panel.dataset.ypmScrollWatch) {
      panel.dataset.ypmScrollWatch = "1";
      const mark = (e) => {
        if (!e.target.closest?.(".ypm-bar")) userScrollAt = Date.now();
      };
      for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) {
        panel.addEventListener(type, mark, { capture: true, passive: true });
      }
    }
    const key = `${Y.videoId()}|${mode?.mode || ""}|${mode?.ts || ""}`;
    if (key !== centerKey) {
      centerKey = key;
      centerUntil = Date.now() + 4000;
      // YouTube renders and scrolls the panel asynchronously, so check again shortly.
      for (const ms of [700, 2000]) {
        setTimeout(() => {
          try {
            YPM.ensureWatchUI();
          } catch (e) {}
        }, ms);
      }
    }
    if (Date.now() > centerUntil || userScrollAt > centerUntil - 4000) return;
    const sc = panelScroller(panel);
    const sel = panel.querySelector("ytd-playlist-panel-video-renderer[selected]");
    if (!sc || !sel || !Y.isVisible(sel)) return;
    const s = sel.getBoundingClientRect();
    const c = sc.getBoundingClientRect();
    if (s.top >= c.top && s.bottom <= c.bottom) return; // already in view
    sc.scrollTop += s.top - c.top - (c.height - s.height) / 2;
  }

  YPM.ensureWatchUI = () => {
    const show = Y.isWatchPage() && Y.isManagedList();
    const mode = show ? Y.getMode() : null;

    for (const panel of getPanels()) {
      panel.classList.toggle("ypm-reversed", mode?.mode === "reverse");
      panel.classList.toggle("ypm-queued", mode?.mode === "queue");
      let bar = panel.querySelector(".ypm-bar");
      if (!show) {
        bar?.remove();
        applyPanelOrder(panel, null);
        continue;
      }
      if (!bar) {
        const anchor = panel.querySelector("#header-contents") || panel.querySelector(".header") || panel.firstElementChild;
        if (!anchor) continue;
        bar = buildBar();
        anchor.insertAdjacentElement("afterend", bar);
      }
      applyPanelOrder(panel, mode);
      if (Y.isVisible(panel)) keepCurrentInView(panel, mode);

      const rev = bar.querySelector(".ypm-reverse");
      Y.setPressed(rev, mode?.mode === "reverse");
      Y.setLabel(rev, mode?.mode === "reverse" ? "Reversed" : "Reverse");
      Y.setPressed(bar.querySelector(".ypm-skip"), !!Y.settings.skipWatched);

      const chip = bar.querySelector(".ypm-queue-chip");
      const isQueue = mode?.mode === "queue";
      if (chip.hidden === isQueue) chip.hidden = !isQueue;
      if (isQueue) Y.setText(chip.querySelector(".ypm-chip-text"), `Custom order: ${mode.label || "queue"} · ${mode.ids.length} videos`);
    }
    if (show) updateProgressLine();
  };
})();
