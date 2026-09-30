# Chrome Extension — TTS Study Assistant

Save text from any page as a note, listen to it, and get AI summaries. Plain Manifest V3 (vanilla JS modules, no build step), backed by the Go API in [`../backend`](../backend) and linking to the web dashboard in [`../frontend`](../frontend).

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. After changing files, press the reload icon on the extension card (and reopen the popup).

## Configuration

`js/config.js`:

| Constant | Production | Local development |
| -------- | ---------- | ----------------- |
| `API_URL` | `https://tts-study-assistant-production.up.railway.app/api/v1` | `http://localhost:3000/api/v1` |
| `DASHBOARD_URL` | `https://tts-study-assistant.vercel.app` | `http://localhost:5173` |

The extension calls the API from its own pages and service worker, so `<all_urls>` host permission covers CORS; the backend's `CORS_ORIGINS` does not need an entry for the extension.

## Features

- **Page selection:** a floating **Save & Play** / **Summarize** button; right-click → Study Assistant (Save, Play, Summarize); **Alt+S** saves the selection.
- **Popup:**
  - **Speed:** 0.5x / 1x / 1.5x / 2x. Older saved speeds snap to the nearest step.
  - **Player:** elapsed/total scrubber, Play/Pause, and Stop (rewinds to 0).
  - **Notes from this site:** one note at a time, with arrows, dots and a final "view all" page. A badge shows the site's note count.
  - **Per note:** Play, a summary toggle (generate → show summary → show note), and delete. Long notes scroll inside the card.
  - **⋮ menu:** Profile, View all notes, Privacy (opening the dashboard in a new tab), and Log out.

## API contract

The client follows `backend/openapi.json`:

- **Passwords:** sent raw over HTTPS; the server stores a bcrypt hash. The limit is 72 UTF-8 bytes.
- **Login:** uses `source: "extension"` for the longer session (1h access token, 90-day refresh token).
- **Expired session:** a 401 with `code: "TOKEN_EXPIRED"` triggers one refresh and a retry. If the refresh is rejected, the session is cleared. Refresh tokens are single-use, so concurrent refreshes in one context share one request.
- **Summaries:** `POST /notes/{id}/summarize` returns `{ summary }`. `"unavailable"` means the text couldn't be summarized.
- **"This site":**
  - The backend stores each note's registrable domain (for example `bbc.co.uk` for `news.bbc.co.uk`).
  - The popup matches the tab against the domains returned by `GET /notes/stats`, instead of guessing the domain from the hostname.
  - The same stats give the site count and the toolbar badge total.

## Playback progress

`chrome.tts` does not report durations.

- The total starts as an estimate: about 14 characters per second × speed.
- After 1.5 seconds of speech, it is re-derived from word-boundary events.
- So it can shift slightly at first, and stays an estimate for voices that don't emit word events.
- Seeking restarts speech at the start of the word nearest the chosen position.
- Changing the speed while playing continues from the current word at the new speed.

The engine lives in the service worker. If Chrome stops the worker, the player state resets.

## Tests

```sh
cd extension
npm test        # node:test, no dependencies: utils and the playback engine
```

## Manual check

1. Reload the extension and open the popup on any page while logged out. You should see Log in / Sign up and a Privacy link.
2. Log in. The header shows only the ⋮ menu.
   - The menu opens with a click or ↓, closes with Esc, and its links open the dashboard in new tabs.
   - Log out is red.
3. **Speed:**
   - Drag the slider, or use the arrow keys: it stops only at the four values, and the active label is bold.
   - Reopen the popup: the value persists.
4. **Notes on this site:**
   - On a page where you saved notes, the heading shows a count badge, and one note is shown.
   - Use the chevrons, dots, or ←/→ (with the carousel focused). The last page offers "View all notes".
   - A long note scrolls inside the card.
5. **Summary toggle:** click the sparkle on a note without a summary. It generates the summary and switches to showing it (document icon). Clicking toggles between the note (green sparkle) and the summary with no new request, and no new note appears on the dashboard.
6. **Player:**
   - Press Play on a note. The scrubber shows elapsed/total, and the total settles after a second or two.
   - Pause and resume continue from the same point. Dragging the scrubber jumps there. Stop resets to 0:00, and Play starts over.
7. **Page selection:** select text on a page and click **Summarize**. A modal shows the summary, and the button is usable again for the next selection.
