/* Hide Shorts (switched on in the toolbar popup). When on, Shorts shelves, cards, the sidebar entry
   and the channel tab are hidden by CSS (see content.css), and any /shorts/ link opens in the normal
   player instead. */
(() => {
  const Y = YPM;
  const on = () => !!Y.settings.hideShorts;
  const shortsId = (path) => path.match(/^\/shorts\/([\w-]+)/)?.[1];

  function apply() {
    document.documentElement.classList.toggle("ypm-no-shorts", on());
    // In-page navigation to a Short (e.g. from a link we didn't catch): reopen it as a normal video.
    const id = on() && shortsId(location.pathname);
    if (id) location.replace(`/watch?v=${id}`);
  }
  Y.onChange(apply);
  document.addEventListener("yt-navigate-finish", apply);

  // Catch clicks on any Shorts link still on the page before YouTube's router opens the Shorts player.
  document.addEventListener(
    "click",
    (e) => {
      if (!on() || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href^="/shorts/"], a[href*="youtube.com/shorts/"]');
      const id = a && shortsId(new URL(a.href, location.origin).pathname);
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      location.assign(`/watch?v=${id}`);
    },
    true
  );
})();
