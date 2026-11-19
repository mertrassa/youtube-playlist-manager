"use strict";
const ext = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { skipWatched: false, watchedThreshold: 90, trackProgress: true, speed: 1 };
const $ = (id) => document.getElementById(id);

const get = (keys) => new Promise((resolve) => ext.storage.local.get(keys, (r) => resolve(r || {})));
const set = (obj) => new Promise((resolve) => ext.storage.local.set(obj, resolve));

let settings = { ...DEFAULTS };

async function render() {
  const r = await get(["settings", "modes", "videos"]);
  settings = { ...DEFAULTS, ...(r.settings || {}) };
  $("skipWatched").checked = settings.skipWatched;
  $("trackProgress").checked = settings.trackProgress;
  $("watchedThreshold").value = String(settings.watchedThreshold);
  $("speed").value = String(settings.speed);

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

function bindSetting(id, read) {
  $(id).addEventListener("change", async () => {
    settings[id] = read($(id));
    await set({ settings });
    render();
  });
}
bindSetting("skipWatched", (el) => el.checked);
bindSetting("trackProgress", (el) => el.checked);
bindSetting("watchedThreshold", (el) => parseInt(el.value, 10));
bindSetting("speed", (el) => parseFloat(el.value));

$("clearHistory").addEventListener("click", async () => {
  if (!confirm("Forget how much of each video you've watched? This can't be undone.")) return;
  await set({ videos: {} });
  render();
});

render();
