/* "Clean up YouTube": hides the buttons chosen in the toolbar popup (catalog in cleanup-items.js).
   early.js adds the <style> at page start; this keeps it current when a switch is flipped. */
(() => {
  const Y = YPM;
  let last = null;

  function apply() {
    const css = YPM_CLEANUP.css(Y.settings.hidden);
    if (css === last && document.getElementById("ypm-cleanup")) return;
    last = css;
    let style = document.getElementById("ypm-cleanup");
    if (!style) {
      style = Y.el("style", { id: "ypm-cleanup" });
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
  }
  Y.onChange(apply);
})();
