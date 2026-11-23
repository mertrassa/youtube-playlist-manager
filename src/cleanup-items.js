/* "Clean up YouTube": the YouTube buttons and page parts you can hide from the toolbar popup.
   Shared by the content scripts (which turn the chosen items into CSS) and the popup (which lists
   them as switches). Selectors were checked against youtube.com in November 2026, signed in and out.
   Under-video buttons and Create are found by the icon name page-tags.js reads from YouTube's data
   (data-ypm-icon), which works in every language; their English label is a fallback.
   `when`: "in" = only exists when you're signed in to YouTube, "out" = only when signed out; the
   popup only lists what applies to you (see cleanup.js for how sign-in is detected). Compared on
   the same pages signed in and signed out, November 2026.
   To add an item: give it a unique `key`, a `label` for the popup and the CSS selector(s) to hide. */
var YPM_CLEANUP = (() => {
  // An under-video action button: by YouTube's icon name(s), or by the start of its English label.
  const action = (icons, label) =>
    [
      ...icons.map((i) => `ytd-watch-metadata [data-ypm-icon="${i}"]`),
      `ytd-watch-metadata :is(yt-button-view-model, ytd-button-renderer):has(button[aria-label^="${label}"])`,
    ].join(", ");

  const groups = [
    {
      title: "Under the video",
      items: [
        { key: "likeDislike", label: "Like / Dislike", css: "ytd-watch-metadata segmented-like-dislike-button-view-model" },
        { key: "share", label: "Share", css: action(["SHARE"], "Share") },
        { key: "save", label: "Save", css: action(["PLAYLIST_ADD"], "Save") },
        { key: "download", label: "Download", css: `ytd-watch-metadata ytd-download-button-renderer, ${action(["DOWNLOAD", "OFFLINE_DOWNLOAD"], "Download")}` },
        { key: "clip", label: "Clip", when: "in", css: action(["CONTENT_CUT"], "Clip") },
        { key: "thanks", label: "Thanks", when: "in", css: action(["MONEY_HEART", "SUPER_THANKS"], "Thanks") },
        { key: "ask", label: "Ask (AI)", when: "in", css: action(["SPARK"], "Ask") },
        {
          key: "moreActions",
          label: "More actions (⋯)",
          css: "ytd-watch-metadata ytd-menu-renderer > :is(yt-button-shape#button-shape, yt-icon-button#button)",
        },
        { key: "join", label: "Join (channel membership)", css: "ytd-watch-metadata #sponsor-button" },
        {
          // Shown once you're subscribed: bell ⌄ with All / Personalised / None / Unsubscribe.
          // On channel pages it replaces the Subscribe button (only that version has the ⌄ arrow).
          key: "subscriptionBell",
          label: "Notification bell of subscribed channels",
          when: "in",
          css: "ytd-subscribe-button-renderer #notification-preference-button, yt-subscribe-button-view-model:has(.ytSpecButtonShapeNextSecondaryIcon)",
        },
      ],
    },
    {
      title: "Video player",
      items: [
        { key: "autoplay", label: "Autoplay switch", css: "#movie_player .ytp-autonav-toggle" },
        { key: "captions", label: "Subtitles", css: "#movie_player .ytp-subtitles-button" },
        { key: "theater", label: "Theater mode", css: "#movie_player .ytp-size-button" },
        { key: "miniplayer", label: "Miniplayer", css: "#movie_player .ytp-miniplayer-button" },
        { key: "pip", label: "Picture-in-picture", css: "#movie_player .ytp-pip-button" },
        { key: "cast", label: "Play on TV", css: "#movie_player .ytp-remote-button" },
        { key: "nextButton", label: "Next video", css: "#movie_player .ytp-next-button" },
        { key: "copyLink", label: "Copy link / Share (top)", css: "#movie_player :is(.ytp-copylink-button, .ytp-share-button)" },
        { key: "cards", label: "Info cards (ⓘ)", css: "#movie_player :is(.ytp-cards-button, .ytp-cards-teaser)" },
        { key: "endCards", label: "Video tiles at the end", css: "#movie_player .ytp-ce-element" },
        { key: "watermark", label: "Channel watermark", css: "#movie_player .ytp-watermark" },
      ],
    },
    {
      title: "Top bar",
      items: [
        { key: "voiceSearch", label: "Voice search", css: "ytd-masthead #voice-search-button" },
        { key: "aiButton", label: "AI assistant", css: "ytd-masthead #ai-companion-button" },
        {
          key: "create",
          label: "Create",
          when: "in",
          css: 'ytd-masthead #buttons [data-ypm-icon="ADD"], ytd-masthead #buttons ytd-button-renderer:has(button[aria-label="Create"])',
        },
        { key: "notifications", label: "Notifications bell (top bar)", when: "in", css: "ytd-masthead ytd-notification-topbar-button-renderer" },
        { key: "countryCode", label: "Country code next to the logo", css: "ytd-topbar-logo-renderer #country-code" },
      ],
    },
    {
      title: "Side menu",
      items: [
        {
          key: "explore",
          label: "Explore",
          css: 'ytd-guide-section-renderer:has(a[href^="/feed/storefront"], a[href^="/gaming"], a[href^="/feed/trending"])',
        },
        { key: "moreFromYouTube", label: "More from YouTube", css: 'ytd-guide-section-renderer:has(a[href^="/premium"])' },
        { key: "signInPromo", label: "“Sign in to like videos” box", when: "out", css: "ytd-guide-signin-promo-renderer" },
        {
          // Signed in, these are sections of their own. Signed out, the same links sit in the top
          // section with Home, so :not(:has(Home)) keeps that section safe.
          key: "subscriptionsSection",
          label: "Subscriptions (your channel list)",
          when: "in",
          css: 'ytd-guide-section-renderer:has(a#endpoint[href="/feed/subscriptions"]):not(:has(a#endpoint[href="/"]))',
        },
        {
          key: "youSection",
          label: "You (history, playlists, Watch later…)",
          when: "in",
          css: 'ytd-guide-section-renderer:has(a#endpoint[href="/feed/you"]):not(:has(a#endpoint[href="/"]))',
        },
        { key: "guideFooter", label: "Footer links and copyright", css: "ytd-guide-renderer #footer" },
      ],
    },
    {
      title: "Pages",
      items: [
        {
          key: "chips",
          label: "Topic chips above feeds and suggestions",
          css: "ytd-feed-filter-chip-bar-renderer, yt-related-chip-cloud-renderer",
        },
        { key: "channelButtons", label: "This extension's channel buttons", css: "#ypm-channel-buttons" },
      ],
    },
  ];

  // One rule per item, so a selector a browser can't parse only disables that one item.
  const css = (hidden = {}) =>
    groups
      .flatMap((g) => g.items)
      .filter((i) => hidden[i.key])
      .map((i) => `${i.css} { display: none !important; }`)
      .join("\n");

  const applies = (item, signedIn) => signedIn == null || !item.when || item.when === (signedIn ? "in" : "out");

  return { groups, css, applies };
})();
