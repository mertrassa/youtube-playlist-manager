/*
 * Playlist Manager for YouTube — shared core: storage, parsing, formatting, small UI helpers.
 * All content scripts share one isolated world, so modules hang off the global YPM object.
 */
"use strict";
var YPM = (globalThis.YPM = globalThis.YPM || {});

(() => {
  const ext = globalThis.browser ?? globalThis.chrome;
  YPM.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------------ */
  /* Persistent state                                                    */
  /* ------------------------------------------------------------------ */

  const DEFAULT_SETTINGS = {
    skipWatched: false, // skip already-watched videos when moving forward through a playlist
    watchedThreshold: 90, // % of a video that counts as "watched"
    trackProgress: true, // remember how much of each video you watched (stored locally)
    speed: 1, // playback speed used for "time left" on playlist pages
    hideShorts: false, // hide Shorts shelves, cards, tabs and menu entries across YouTube
    hideInterruptions: true, // hide the "Experiencing interruptions?" toast
    hidden: {}, // "Clean up YouTube": key from cleanup-items.js -> true to hide that button
  };
  const MAX_VIDEOS = 8000; // cap for the local watch-progress / duration cache

  YPM.settings = { ...DEFAULT_SETTINGS };
  YPM.modes = {}; // listId -> { mode: "reverse" } | { mode: "queue", ids: [...], label }
  YPM.videos = {}; // videoId -> { p: watched fraction 0..1, d: duration in seconds, ts }

  const listeners = [];
  YPM.onChange = (fn) => listeners.push(fn);
  YPM.emit = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch (e) {
        console.error("[Playlist Manager]", e);
      }
    }
  };

  const storageGet = (keys) =>
    new Promise((resolve) => {
      try {
        ext.storage.local.get(keys, (r) => resolve(r || {}));
      } catch (e) {
        resolve({});
      }
    });
  const storageSet = (obj) => {
    try {
      ext.storage.local.set(obj);
    } catch (e) {
      /* extension context gone (reloaded) — keep working in memory */
    }
  };

  function mergeVideos(incoming) {
    for (const [id, v] of Object.entries(incoming || {})) {
      const cur = YPM.videos[id];
      if (!cur) YPM.videos[id] = v;
      else {
        cur.p = Math.max(cur.p || 0, v.p || 0) || undefined;
        cur.d = cur.d || v.d;
        cur.ts = Math.max(cur.ts || 0, v.ts || 0);
      }
    }
  }

  YPM.load = async () => {
    const r = await storageGet(["settings", "modes", "videos", "reversedLists"]);
    YPM.settings = { ...DEFAULT_SETTINGS, ...(r.settings || {}) };
    YPM.modes = r.modes || {};
    YPM.videos = r.videos || {};
    if (r.reversedLists) {
      // Migrate settings from v1 ("Playlist Reverser").
      for (const id of Object.keys(r.reversedLists)) YPM.modes[id] = YPM.modes[id] || { mode: "reverse" };
      storageSet({ modes: YPM.modes });
      try {
        ext.storage.local.remove("reversedLists");
      } catch (e) {}
    }
    try {
      ext.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") return;
        if (ch.settings) YPM.settings = { ...DEFAULT_SETTINGS, ...(ch.settings.newValue || {}) };
        if (ch.modes) YPM.modes = ch.modes.newValue || {};
        if (ch.videos) {
          const nv = ch.videos.newValue;
          if (!nv || !Object.keys(nv).length) YPM.videos = {}; // cleared from the popup
          else mergeVideos(ch.videos.newValue);
        }
        YPM.emit();
      });
    } catch (e) {}
    YPM.emit();
  };

  YPM.getMode = (list = YPM.listId()) => (list && YPM.modes[list]) || null;
  YPM.setMode = (list, mode) => {
    if (!list) return;
    if (mode) YPM.modes[list] = { ...mode, title: mode.title || YPM.playlistTitle(), ts: Date.now() };
    else delete YPM.modes[list];
    storageSet({ modes: YPM.modes });
    YPM.emit();
  };
  YPM.setSetting = (key, value) => {
    YPM.settings[key] = value;
    storageSet({ settings: YPM.settings });
    YPM.emit();
  };

  let saveTimer = 0;
  function scheduleSaveVideos() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ids = Object.keys(YPM.videos);
      if (ids.length > MAX_VIDEOS) {
        ids.sort((a, b) => (YPM.videos[a].ts || 0) - (YPM.videos[b].ts || 0));
        for (const id of ids.slice(0, ids.length - MAX_VIDEOS)) delete YPM.videos[id];
      }
      storageSet({ videos: YPM.videos });
    }, 3000);
  }

  /** Remember a video's duration and/or how much of it was watched (keeps the maximum). */
  YPM.recordVideo = (id, { p, d } = {}) => {
    if (!id) return;
    const v = YPM.videos[id] || (YPM.videos[id] = {});
    let changed = false;
    if (p != null && p > (v.p || 0) + 0.004) {
      v.p = Math.min(1, Math.round(p * 1000) / 1000);
      changed = true;
    }
    if (d && Math.round(d) !== v.d) {
      v.d = Math.round(d);
      changed = true;
    }
    if (changed) {
      v.ts = Date.now();
      scheduleSaveVideos();
    }
  };

  /** Watched fraction (0..1), combining YouTube's red resume bar and our own record. */
  YPM.watchedFraction = (id, ytFraction = 0) => Math.max(ytFraction || 0, YPM.videos[id]?.p || 0);
  YPM.isWatched = (id, ytFraction = 0) => YPM.watchedFraction(id, ytFraction) >= YPM.settings.watchedThreshold / 100;

  /* ------------------------------------------------------------------ */
  /* URL / page helpers                                                  */
  /* ------------------------------------------------------------------ */

  const params = () => new URLSearchParams(location.search);
  YPM.listId = () => params().get("list");
  YPM.videoId = () => params().get("v");
  YPM.isWatchPage = () => location.pathname === "/watch";
  YPM.isPlaylistPage = () => location.pathname === "/playlist";
  // Mixes (RD…) are endless auto-generated queues — nothing to manage there.
  YPM.isManagedList = (id = YPM.listId()) => !!id && !id.startsWith("RD");

  YPM.parseHref = (href) => {
    try {
      const u = new URL(href, location.origin);
      return {
        v: u.searchParams.get("v"),
        list: u.searchParams.get("list"),
        index: parseInt(u.searchParams.get("index"), 10),
      };
    } catch (e) {
      return {};
    }
  };

  YPM.isVisible = (el) => !!el && el.offsetParent !== null;

  /** Human name of the current playlist (for the popup's list). */
  YPM.playlistTitle = () => {
    // Channel upload lists (UU…) are all just called "Videos" — name them after the channel.
    const uploads = /^UU/.test(YPM.listId() || "");
    if (YPM.isPlaylistPage()) {
      const page = document.querySelector('ytd-browse[page-subtype="playlist"]:not([hidden])');
      const channel = page?.querySelector('yt-page-header-view-model a[href^="/@"], ytd-playlist-header-renderer a[href^="/@"]');
      if (uploads && channel) return `${channel.textContent.trim()} — all videos`;
      return document.title.replace(/\s*-\s*YouTube$/, "").trim() || undefined;
    }
    const panel = [...document.querySelectorAll("ytd-playlist-panel-renderer")].find(YPM.isVisible);
    const channel = panel
      ?.querySelector('#publisher-container a[href^="/@"], #publisher-container a[href^="/channel/"]')
      ?.textContent.trim();
    if (uploads && channel) return `${channel} — all videos`;
    return panel?.querySelector("#header-description h3, .title, #title")?.textContent.trim() || undefined;
  };

  /* ------------------------------------------------------------------ */
  /* Parsing & formatting                                                */
  /* ------------------------------------------------------------------ */

  /** "1:02:03" / "10:08" -> seconds. */
  YPM.parseClock = (text) => {
    const m = String(text || "").trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
  };

  /** "…title 1 hour, 7 minutes, 57 seconds" (English aria-labels) -> seconds. */
  YPM.parseSpokenDuration = (text) => {
    if (!text) return null;
    const grab = (re) => +(text.match(re)?.[1] || 0);
    const h = grab(/(\d+)\s*hours?\b/i);
    const m = grab(/(\d+)\s*minutes?\b/i);
    const s = grab(/(\d+)\s*seconds?\b/i);
    return h || m || s ? h * 3600 + m * 60 + s : null;
  };

  /** "265K" / "1.2M views" / "1,234 views" -> number. */
  YPM.parseCount = (text) => {
    const m = String(text || "").replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
    if (!m) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1;
    return Math.round(parseFloat(m[1]) * mult);
  };

  /** "3y ago" / "11mo ago" / "2 weeks ago" / "Streamed 5 days ago" -> approximate age in days. */
  YPM.parseAge = (text) => {
    const m = String(text || "").match(/(\d+)\s*(seconds?|s|minutes?|min|mi|hours?|h|days?|d|weeks?|w|months?|mo|years?|y)\b/i);
    if (!m) return null;
    const n = +m[1];
    const u = m[2].toLowerCase();
    if (u.startsWith("mo")) return n * 30;
    if (u.startsWith("mi") || u === "min") return n / 1440;
    if (u.startsWith("s")) return n / 86400;
    if (u.startsWith("h")) return n / 24;
    if (u.startsWith("d")) return n;
    if (u.startsWith("w")) return n * 7;
    if (u.startsWith("y")) return n * 365;
    return null;
  };

  /** seconds -> "2h 14m", "7m 57s", "45s". */
  YPM.formatDuration = (sec) => {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  };

  /* ------------------------------------------------------------------ */
  /* DOM helpers (no innerHTML: YouTube enforces Trusted Types)          */
  /* ------------------------------------------------------------------ */

  /** el("button", { className: "x", onclick }, "text", childNode) */
  YPM.el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k in node && k !== "list") node[k] = v;
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  };

  /** Pill button with an icon and a label. */
  YPM.button = (icon, label, onClick, props = {}) => {
    const b = YPM.el(
      "button",
      { type: "button", className: `ypm-btn ${props.className || ""}`.trim(), title: props.title },
      YPM.el("span", { className: "ypm-icon", "aria-hidden": "true" }, icon),
      YPM.el("span", { className: "ypm-label" }, label)
    );
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(b, e);
    });
    return b;
  };

  // Write text only when it changed, so our own MutationObserver isn't woken up needlessly.
  YPM.setText = (node, text) => {
    if (node && node.textContent !== text) node.textContent = text;
  };
  YPM.setLabel = (btn, text) => YPM.setText(btn.querySelector(".ypm-label"), text);
  YPM.setPressed = (btn, on) => {
    if (btn.getAttribute("aria-pressed") !== String(on)) btn.setAttribute("aria-pressed", String(on));
  };

  let toastTimer = 0;
  YPM.toast = (msg) => {
    let t = document.getElementById("ypm-toast");
    if (!t) {
      t = YPM.el("div", { id: "ypm-toast", className: "ypm-toast", role: "status" });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("ypm-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("ypm-show"), 3000);
  };

  /** Copy colour from a neighbouring YouTube button so ours match headers with custom themes. */
  YPM.matchColor = (group, neighbours) => {
    const sib = neighbours.find((el) => !group.contains(el) && YPM.isVisible(el));
    const color = sib && getComputedStyle(sib).color;
    if (color && group.style.color !== color) group.style.color = color;
  };
})();
