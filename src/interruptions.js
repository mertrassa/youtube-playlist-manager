/* Hide YouTube's "Experiencing interruptions? Find out why" toast (bottom-left of the page).
   Purely cosmetic: the toast is hidden and lets clicks through; playback isn't touched.
   CSS (content.css) catches it instantly by its "Find out why" help link; this script also catches
   it by its text, in case the link changes. YouTube reuses the same toast element for other
   messages ("Saved to Watch later"), so the mark is removed again when the text changes. */
(() => {
  const Y = YPM;
  const TEXT = /experiencing interruptions/i;

  YPM.ensureInterruptionsUI = () => {
    const on = Y.settings.hideInterruptions !== false;
    document.documentElement.classList.toggle("ypm-no-interruptions", on);
    for (const toast of document.querySelectorAll("tp-yt-paper-toast")) {
      toast.classList.toggle("ypm-interruptions-toast", on && TEXT.test(toast.textContent));
    }
  };
})();
