/* Runs in YouTube's own page context ("world": "MAIN" in the manifest) so it can read the data
   behind YouTube's buttons, which the extension's normal scripts can't see. It gives the
   under-video action buttons and the Create button a language-independent name, e.g.
   data-ypm-icon="SHARE" or "PLAYLIST_ADD", which the "Clean up YouTube" CSS uses
   (see cleanup-items.js), and copies YouTube's signed-in flag onto <html data-ypm-signed-in>.
   It only reads YouTube's data and sets those attributes. */
(() => {
  // Depth-first walk over YouTube's renderer data.
  function walk(obj, fn, seen = new Set()) {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return;
    seen.add(obj);
    fn(obj);
    for (const v of Object.values(obj)) walk(v, fn, seen);
  }

  // A button's icon name and the labels it can show (these match the on-screen aria-labels).
  function describe(item) {
    let icon = null;
    const labels = new Set();
    walk(item, (o) => {
      if (!icon && typeof o.iconName === "string") icon = o.iconName;
      if (!icon && typeof o.icon?.iconType === "string") icon = o.icon.iconType;
      for (const k of ["accessibilityText", "title"]) if (typeof o[k] === "string") labels.add(o[k]);
      if (typeof o.accessibilityData?.label === "string") labels.add(o.accessibilityData.label);
    });
    return { icon, labels };
  }

  function tag(host, icon) {
    if (icon) {
      if (host.dataset.ypmIcon !== icon) host.dataset.ypmIcon = icon;
    } else if (host.dataset.ypmIcon) {
      delete host.dataset.ypmIcon; // element reused for something else
    }
  }

  // YouTube's own sign-in flag, copied to <html data-ypm-signed-in> for cleanup.js to read.
  function markSignIn() {
    const v = window.ytcfg?.get?.("LOGGED_IN");
    const s = typeof v === "boolean" ? String(v) : null;
    if (s && document.documentElement.dataset.ypmSignedIn !== s) document.documentElement.dataset.ypmSignedIn = s;
  }

  const HOST = "yt-button-view-model, ytd-button-renderer, ytd-download-button-renderer";

  function tagActions() {
    markSignIn();
    for (const menu of document.querySelectorAll("ytd-watch-metadata ytd-menu-renderer")) {
      const d = menu.data;
      if (!d) continue;
      const entries = [...(d.topLevelButtons || []), ...(d.flexibleItems || [])].map(describe).filter((e) => e.icon);
      for (const btn of menu.querySelectorAll("button[aria-label]")) {
        const host = btn.closest(HOST);
        if (!host || !menu.contains(host)) continue;
        const label = btn.getAttribute("aria-label");
        tag(host, entries.find((e) => e.labels.has(label))?.icon);
      }
    }
    for (const b of document.querySelectorAll("ytd-masthead #buttons > ytd-button-renderer")) {
      tag(b, b.data ? describe(b.data).icon : null);
    }
  }

  let timer = 0;
  const schedule = () => {
    if (!timer) timer = setTimeout(() => ((timer = 0), tagActions()), 300);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("yt-navigate-finish", schedule);
  schedule();
})();
