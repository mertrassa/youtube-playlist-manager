/*
 * Channel pages: "Play all" and "Oldest first" buttons next to Subscribe.
 * Every channel has an auto-generated uploads playlist: UU + channel id without "UC".
 * UULF… is the same list without Shorts and live streams.
 */
(() => {
  const Y = YPM;

  function channelId() {
    // On channel pages YouTube keeps <link rel=canonical> pointing at /channel/UC…
    const canon = document.querySelector('link[rel="canonical"]')?.href || "";
    const m = canon.match(/\/channel\/(UC[\w-]{22})/);
    return m ? m[1] : null;
  }

  function isChannelPage() {
    return /^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)(\/|$)/.test(location.pathname);
  }

  YPM.ensureChannelUI = () => {
    let group = document.getElementById("ypm-channel-buttons");
    const id = isChannelPage() ? channelId() : null;
    const browse = document.querySelector('ytd-browse[page-subtype="channels"]:not([hidden])');
    if (!id || !browse) {
      group?.remove();
      return;
    }
    // Canonical can lag behind during in-app navigation; make sure it matches this page.
    if (location.pathname.startsWith("/channel/") && !location.pathname.includes(id)) return;

    const subscribe = [...browse.querySelectorAll("button, a")].find(
      (b) => Y.isVisible(b) && /subscribe|subscribed/i.test((b.getAttribute("aria-label") || "") + b.textContent)
    );
    const slot = subscribe?.closest(".ytFlexibleActionsViewModelAction") || subscribe?.closest("ytd-subscribe-button-renderer, #subscribe-button");
    if (group && (group.dataset.channel !== id || (slot && group.previousElementSibling !== slot))) {
      group.remove();
      group = null;
    }
    if (group) return;

    const uploads = "UULF" + id.slice(2);
    const link = (icon, label, href, title) =>
      Y.el(
        "a",
        { className: "ypm-btn", href, title },
        Y.el("span", { className: "ypm-icon", "aria-hidden": "true" }, icon),
        Y.el("span", { className: "ypm-label" }, label)
      );
    group = Y.el(
      "div",
      { id: "ypm-channel-buttons", className: slot ? "ypm-inline-group" : "ypm-floating", dataset: { channel: id } },
      link("▶", "Play all", `/playlist?list=${uploads}`, "All of this channel's videos (no Shorts or streams), newest first"),
      link("⤒", "Oldest first", `/playlist?list=${uploads}#ypm=reverse`, "Watch this channel from its very first video")
    );
    if (slot) {
      slot.insertAdjacentElement("afterend", group);
      Y.matchColor(group, [...slot.parentElement.querySelectorAll("button")].filter((b) => b !== subscribe));
    } else {
      document.body.appendChild(group);
    }
  };
})();
