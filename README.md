# Playlist Manager for YouTube

A browser extension (Manifest V3, for Chrome, Edge, Brave and Firefox) that makes long YouTube playlists easier to watch. You can search, filter and sort any playlist, play it in any order (including reversed), skip videos you've already watched, see how much time is left, hide Shorts, get rid of the "Experiencing interruptions?" popup, and hide any YouTube buttons you don't use. Nothing is sent anywhere, and you don't need to sign in.

It combines the most useful ideas from the top "YouTube playlist" extensions in the Chrome Web Store into one tool.

| Idea | Seen in |
| --- | --- |
| Total length, watched %, time left adjusted for playback speed | Playlist Duration bar, Playlist Guru |
| Search a playlist, filter by length, watch status and channel | Playlist Search, Playlist Filters, PocketTube |
| Sort by title, channel, length, views or upload date, or shuffle | Playlist Guru, Playlist Sorter |
| Export as CSV, JSON or a list of links | Playlist Sorter |
| "Play all" for a channel's uploads | Channel Playlists |
| Reverse playback | This extension (v1) |
| Hide Shorts | Shorts blockers |
| Hide the "Experiencing interruptions?" popup | uBlock Origin filter lists |
| Hide buttons you don't use | YouTube "clean UI" extensions |

## Features

### On a playlist page (`youtube.com/playlist?list=…`)

A toolbar appears above the videos:

- **Stats.** Number of videos, total length, how many you've watched, and time left at your chosen speed (1×–2×). For long playlists it shows "100 of 653 loaded" until all videos are loaded.
- **Search** titles and channel names.
- **Filters:**
  - length (under 5 min, 5–20 min, 20–60 min, over 1 hour)
  - watch status (unwatched, in progress, watched, duplicates)
  - channel
- **Sort:**
  - playlist order or reversed
  - title A→Z or Z→A
  - channel
  - shortest or longest first
  - most viewed
  - newest or oldest upload
  - least watched first
  - shuffle
- **▶ Play shown** plays exactly the videos you see, in the order you see them.
- **↪ Continue** starts from the first unwatched video in that order.
- **⤓ Export** saves the shown videos as CSV or JSON, or copies their links.
- **Load all** fetches every video in long playlists. YouTube loads them 100 at a time. Sorting, filtering and playing load everything automatically when needed.

Sorting and filtering only change what's on screen. Your playlist on YouTube is never modified.

### On a watch page that's playing a playlist

A bar under the playlist panel header:

- **⇅ Reverse** plays the playlist from last to first. The panel is flipped too.
- **⏭ Skip watched** skips videos you've already finished when moving forward. Watched videos are dimmed in the panel.
- **Custom order chip** shows the order you picked on the playlist page, such as "Custom order: Shortest first, 20–60 min · 13 videos". Click ✕ to go back to normal order.
- **Progress line** shows which video you're on and the time left, such as "Video 12 of 35 · 1h 05m left at 1.5×", with a thin progress bar.

Your chosen order also controls the end of each video, the player's **Next** and **Previous** buttons, and **Shift+N** / **Shift+P**. YouTube's playlist **loop** button is respected.

### On a channel page

Two buttons appear next to Subscribe:

- **▶ Play all** opens all of the channel's videos as a playlist, without Shorts or live streams.
- **⤒ Oldest first** starts from the channel's very first video and plays forward in time.

### Everywhere on YouTube: hide Shorts

Tick **Shorts, everywhere on YouTube** in the toolbar popup (under *Hide on YouTube*) and Shorts disappear from:

- the home and subscriptions feeds
- search results
- channel pages (the Shorts shelf and the Shorts tab)
- the sidebar menu
- suggestions next to the video you're watching

Normal videos stay where they are. A Short you open from a link (a chat or an email, say) plays in the normal video player instead. Untick it to bring Shorts back. The change applies to open YouTube tabs right away.

### Everywhere on YouTube: no "Experiencing interruptions?" popup

YouTube sometimes shows an "Experiencing interruptions? Find out why" message in the bottom-left corner when a video starts, usually because it suspects an ad blocker. The extension hides it, and the hidden box no longer blocks clicks on what's underneath. Other YouTube messages, such as "Saved to Watch later", still show.

This is on by default, and you can turn it off in the toolbar popup. It only hides the message. If YouTube also delays the start of the video, that delay stays, because the extension doesn't change how YouTube plays videos.

### Clean up YouTube: hide buttons you don't use

In the toolbar popup, **Clean up YouTube** lists the buttons and page parts you can hide. Tick one and it disappears right away from every YouTube tab; untick it to bring it back. **Show all again** resets everything. The items are grouped by where they sit:

| Group | What you can hide |
| --- | --- |
| Under the video | Like / Dislike, Share, Save, Download, Clip, Thanks, Ask (AI), More actions (⋯), Join, the notification bell of channels you're subscribed to |
| Video player | Autoplay switch, Subtitles, Theater mode, Miniplayer, Picture-in-picture, Play on TV, Next video, Copy link / Share, Info cards, Video tiles at the end, Channel watermark |
| Top bar | Voice search, AI assistant, Create, Notifications bell, Country code next to the logo |
| Side menu | Explore, More from YouTube, Subscriptions (your channel list), You (history, playlists…), the "Sign in to like videos" box, footer links |
| Pages | Topic chips above feeds and suggestions, this extension's channel buttons |

**The list matches your account.** YouTube shows different buttons when you're signed in (Create, the notifications bell, Ask, Clip, Thanks, the bell on subscribed channels, the Subscriptions and You menu sections) than when you're signed out (the "Sign in to like videos" box). The extension notices which one you are each time you open YouTube, and the popup only lists the switches for buttons you'll actually see. A line at the top says which list you're looking at. **Show all** lists every switch, which helps if you use YouTube both ways. Switches you ticked stay on even while they're not listed.

Nothing is hidden until you tick it. Hiding the notification bell of subscribed channels also hides its menu, which is where **Unsubscribe** lives, on both watch and channel pages. Untick it when you want to unsubscribe from a channel. Hiding a button doesn't turn off its keyboard shortcut, so `t` still toggles theater mode and `c` still toggles subtitles.

To add another button, add an entry to `src/cleanup-items.js`. The popup picks it up automatically.

### Toolbar popup

Click the extension icon to:

- turn *Skip watched* on or off
- hide or show Shorts
- hide or show the "Experiencing interruptions?" popup
- hide YouTube buttons you don't use (Clean up YouTube)
- choose when a video counts as watched (50 / 75 / 90 / 95 %)
- set the default speed for "time left"
- turn watch-progress tracking on or off, or clear it
- see playlists that have a custom order, and reset any of them

## Install

Download this repository (`git clone https://github.com/mertrassa/youtube-playlist-manager.git`, or **Code → Download ZIP** and unzip it), then:

### Chrome, Edge, Brave, Opera
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `youtube-playlist-manager` folder.
4. Reload any open YouTube tabs.

If you installed v1 ("Playlist Reverser") from the old `youtube-playlist-reverser` folder, remove it first. That folder has been renamed to this one.

### Firefox (128+)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json`.

Temporary add-ons are removed when Firefox restarts. To keep it, sign it on addons.mozilla.org.

## How it works

- **Watched status** combines two sources. One is YouTube's red progress bar on thumbnails (only shown when you're signed in). The other is the extension's own record of how much of each video you played, kept in this browser only and capped at 8,000 videos.
- **Custom play order.** The extension pauses each video about half a second before it ends, then opens the next video in your order. It uses YouTube's own playlist panel links when it can, so navigation stays inside the page.
- **Reordering** uses CSS (`order`, `flex-direction`), so YouTube's page and data are never rewritten.
- **Loading long playlists** scrolls until the count matches YouTube's "N videos" figure, minus any hidden unavailable videos. If YouTube stops sending pages, it gives up after 12 seconds without new videos. Expect about 5–10 seconds per 100 videos.

## Files

```
manifest.json        MV3 manifest (only permission: storage)
src/core.js          shared state, storage, parsing, UI helpers
src/watch.js         watch page: play order, skip watched, progress line
src/playlist.js      playlist page toolbar: stats, search, filters, sort, export
src/channel.js       channel page buttons
src/shorts.js        hides Shorts and opens Shorts links in the normal player
src/interruptions.js hides the "Experiencing interruptions?" popup
src/cleanup-items.js list of hideable YouTube buttons (used by the page and the popup)
src/cleanup.js       hides the buttons you picked; notes whether you're signed in
src/page-tags.js     reads YouTube's button data and sign-in flag (runs in the page)
src/early.js         applies the hide settings before YouTube first draws the page
src/main.js          wiring for YouTube's in-page navigation
src/content.css      styles (follows YouTube's light and dark themes)
popup/               toolbar popup (settings, history, saved orders)
icons/
```

## Deliberately left out

Some popular extensions also edit your playlists on YouTube: removing videos, moving them between playlists, or saving a new order. They do that through YouTube's private, undocumented API while you're signed in. That breaks without warning and can change your account in ways that are hard to undo, so this extension only reads.

## Limitations

- Durations on the watch page come from YouTube's English accessibility labels. In other languages they fill in once you've opened the playlist page once.
- Upload-age sorting uses YouTube's rounded "3 years ago" labels, so it's approximate.
- Hiding Shorts finds the sidebar entry and channel tab by the word "Shorts". YouTube uses that word in most languages (including English and Turkish), but if yours differs those two may stay visible.
- The "Experiencing interruptions?" popup is caught by its help link, or by its English text. If YouTube changes both, it will show again until the extension is updated.
- Under-video buttons and the Create button are recognised by the icon names in YouTube's own data, so they work in any language (tested in English and Turkish). Clip, Thanks and Download weren't on screen during testing; if one of those doesn't hide, YouTube may use a different icon name for it.
- Keyboard media keys and headset buttons still use YouTube's own next/previous.
- YouTube changes its page layout often. If something stops appearing, the selectors at the top of each file in `src/` are the place to look.

## Contributing

Issues and pull requests are welcome. YouTube changes its layout often, so reports of something that stopped appearing (with the page URL and a screenshot) are especially useful.

## License

Copyright (C) 2026 Mert Rassa

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for the full text.
