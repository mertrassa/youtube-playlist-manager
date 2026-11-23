/* Wiring: run each page module after YouTube's in-app navigations and DOM updates. */
(() => {
  const Y = YPM;

  function refresh() {
    for (const fn of [Y.ensureWatchUI, Y.ensurePlaylistUI, Y.ensureChannelUI, Y.ensureInterruptionsUI, Y.ensureAccountState]) {
      try {
        fn();
      } catch (e) {
        console.error("[Playlist Manager]", e);
      }
    }
  }

  let timer = 0;
  let lastRun = 0;
  function scheduleRefresh() {
    if (timer) return;
    // Debounce, but never let a busy page starve us for more than ~1s.
    const wait = Math.max(250, Math.min(1000, 1000 - (Date.now() - lastRun)));
    timer = setTimeout(() => {
      timer = 0;
      lastRun = Date.now();
      refresh();
    }, wait);
  }

  // Ignore mutations that only touch our own UI (labels, counters, progress text).
  const ours = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!el?.closest?.(".ypm-bar, .ypm-toolbar, .ypm-toast, #ypm-channel-buttons");
  };
  new MutationObserver((records) => {
    if (records.every((r) => ours(r.target))) return;
    scheduleRefresh();
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("yt-navigate-finish", scheduleRefresh);
  Y.onChange(scheduleRefresh);
  Y.load();
})();
