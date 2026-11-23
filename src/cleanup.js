/* "Clean up YouTube": hides the buttons chosen in the toolbar popup (catalog in cleanup-items.js).
   early.js adds the <style> at page start; this keeps it current when a switch is flipped.
   It also notes whether you're signed in to YouTube, so the popup only lists buttons you can see. */
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

  // Signed in? YouTube's own LOGGED_IN flag (copied onto <html> by page-tags.js), else the top bar:
  // an avatar button means signed in, a link to Google's sign-in page means signed out.
  YPM.ensureAccountState = () => {
    const flag = document.documentElement.dataset.ypmSignedIn;
    let signedIn = flag === "true" ? true : flag === "false" ? false : null;
    if (signedIn === null) {
      if (document.querySelector("ytd-masthead #avatar-btn")) signedIn = true;
      else if (document.querySelector('ytd-masthead a[href*="accounts.google.com/ServiceLogin"]')) signedIn = false;
    }
    if (signedIn !== null) Y.setSignedIn(signedIn);
  };
})();
