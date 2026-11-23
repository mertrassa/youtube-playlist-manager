"use strict";
const ext = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { skipWatched: false, watchedThreshold: 90, trackProgress: true, speed: 1, hideShorts: false, hideInterruptions: true, hidden: {} };
const $ = (id) => document.getElementById(id);

const get = (keys) => new Promise((resolve) => ext.storage.local.get(keys, (r) => resolve(r || {})));
const set = (obj) => new Promise((resolve) => ext.storage.local.set(obj, resolve));

let settings = { ...DEFAULTS };

async function render() {
  const r = await get(["settings", "modes", "videos", "account"]);
  settings = { ...DEFAULTS, ...(r.settings || {}) };
  $("skipWatched").checked = settings.skipWatched;
  $("hideShorts").checked = settings.hideShorts;
  $("hideInterruptions").checked = settings.hideInterruptions;
  $("trackProgress").checked = settings.trackProgress;
  $("watchedThreshold").value = String(settings.watchedThreshold);
  $("speed").value = String(settings.speed);

  renderCleanup(r.account);

  const videos = r.videos || {};
  const watched = Object.values(videos).filter((v) => (v.p || 0) * 100 >= settings.watchedThreshold).length;
  const tracked = Object.values(videos).filter((v) => v.p).length;
  $("historyInfo").textContent = `${tracked} videos with progress, ${watched} watched. Stored only in this browser.`;

  const modes = Object.entries(r.modes || {}).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  const ul = $("modes");
  ul.replaceChildren(
    ...modes.map(([list, m]) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
      a.target = "_blank";
      a.textContent = m.title || list;
      a.title = list;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = m.mode === "reverse" ? "Reversed" : `${m.label || "Custom"} (${m.ids?.length || 0})`;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.title = "Back to normal order";
      x.setAttribute("aria-label", `Reset order for ${list}`);
      x.addEventListener("click", async () => {
        const cur = (await get("modes")).modes || {};
        delete cur[list];
        await set({ modes: cur });
        render();
      });
      li.append(a, tag, x);
      return li;
    })
  );
  $("modesEmpty").hidden = modes.length > 0;
}

// "Clean up YouTube": one fold-out group per page area, one switch per item (from cleanup-items.js).
// Only the items that exist in your last-seen YouTube sign-in state are listed, unless "Show all".
const openGroups = new Set();
let showEverything = false;
function renderCleanup(account) {
  const hidden = settings.hidden || {};
  const known = typeof account?.signedIn === "boolean";
  const signedIn = known && !showEverything ? account.signedIn : null;

  $("accountInfo").textContent = !known
    ? "Open YouTube once and this list will match whether you're signed in."
    : showEverything
      ? "Showing options for both signed in and signed out."
      : account.signedIn
        ? "You're signed in to YouTube, so these are the buttons you'll see."
        : "You're signed out of YouTube, so these are the buttons you'll see.";
  $("showAllOptions").hidden = !known;
  $("showAllOptions").textContent = showEverything ? "Only mine" : "Show all";

  const groups = YPM_CLEANUP.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => YPM_CLEANUP.applies(i, signedIn)) }))
    .filter((g) => g.items.length);

  const box = $("cleanup");
  box.replaceChildren(
    ...groups.map((g) => {
      const count = g.items.filter((i) => hidden[i.key]).length;
      const details = document.createElement("details");
      details.open = openGroups.has(g.title);
      details.addEventListener("toggle", () => (details.open ? openGroups.add(g.title) : openGroups.delete(g.title)));
      const summary = document.createElement("summary");
      summary.textContent = g.title;
      if (count) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${count} hidden`;
        summary.append(" ", tag);
      }
      details.append(
        summary,
        ...g.items.map((i) => {
          const label = document.createElement("label");
          label.className = "row";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = !!hidden[i.key];
          input.addEventListener("change", async () => {
            const next = { ...(settings.hidden || {}) };
            if (input.checked) next[i.key] = true;
            else delete next[i.key];
            settings.hidden = next;
            await set({ settings });
            render();
          });
          const text = document.createElement("span");
          text.textContent = i.label;
          label.append(input, text);
          return label;
        })
      );
      return details;
    })
  );
  $("showAll").hidden = !Object.keys(hidden).length;
}
$("showAllOptions").addEventListener("click", () => {
  showEverything = !showEverything;
  render();
});
$("showAll").addEventListener("click", async () => {
  settings.hidden = {};
  await set({ settings });
  render();
});

function bindSetting(id, read) {
  $(id).addEventListener("change", async () => {
    settings[id] = read($(id));
    await set({ settings });
    render();
  });
}
bindSetting("skipWatched", (el) => el.checked);
bindSetting("hideShorts", (el) => el.checked);
bindSetting("hideInterruptions", (el) => el.checked);
bindSetting("trackProgress", (el) => el.checked);
bindSetting("watchedThreshold", (el) => parseInt(el.value, 10));
bindSetting("speed", (el) => parseFloat(el.value));

$("clearHistory").addEventListener("click", async () => {
  if (!confirm("Forget how much of each video you've watched? This can't be undone.")) return;
  await set({ videos: {} });
  render();
});

render();
