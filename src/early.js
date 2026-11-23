/* Runs at document_start, before YouTube draws anything, so page-wide hiding applies from the first
   paint: the "Clean up YouTube" choices, Shorts (if turned on) and the "Experiencing interruptions?"
   toast (on by default). With Shorts hidden, /shorts/<id> URLs go to the normal player before the
   Shorts player loads. cleanup.js keeps the same <style> up to date afterwards. */
(() => {
  const ext = globalThis.browser ?? globalThis.chrome;
  try {
    ext.storage.local.get("settings", (r) => {
      const s = r?.settings || {};
      const root = document.documentElement;

      const style = document.createElement("style");
      style.id = "ypm-cleanup";
      style.textContent = YPM_CLEANUP.css(s.hidden);
      (document.head || root).appendChild(style);

      if (s.hideInterruptions !== false) root.classList.add("ypm-no-interruptions");
      if (!s.hideShorts) return;
      root.classList.add("ypm-no-shorts");
      const m = location.pathname.match(/^\/shorts\/([\w-]+)/);
      if (m) location.replace(`/watch?v=${m[1]}`);
    });
  } catch (e) {
    // Extension context gone (e.g. just updated): nothing to do.
  }
})();
