# Chrome Extension — TTS Study Assistant

Save text from any page as a note, listen to it, and get AI summaries. Plain Manifest V3 (vanilla JS modules, no build step), backed by the Go API in [`../backend`](../backend) and linking to the web dashboard in [`../frontend`](../frontend).

## Install from the Chrome Web Store

**[TTS Study Assistant on the Chrome Web Store](https://chromewebstore.google.com/detail/tts-study-assistant/lpnchhblldgnnjgmkbmanggilffhbnnp)**: click *Add to Chrome*. Installed copies update automatically when a new version is published.

## Install unpacked (development)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. After changing files, press the reload icon on the extension card (and reopen the popup).

### Firefox (in progress)

Firefox support is tracked in the [Firefox release (AMO) milestone](https://github.com/pratts/tts-study-assistant/milestone/1).

```sh
cd extension
npx web-ext@10.8.0 run --ignore-files tests package.json README.md   # opens Firefox with the extension loaded
npx web-ext@10.8.0 lint --ignore-files tests package.json README.md  # Mozilla's add-on linter (CI runs it on the release zip)
```

Or open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `manifest.json`.

One `manifest.json` serves both browsers:

- **Background:** Chrome uses `background.service_worker`; Firefox doesn't support extension service workers and uses `background.scripts` (an event page) with the same file. Chrome 121+ ignores `scripts`, hence `minimum_chrome_version: 121`.
- **`browser_specific_settings.gecko`:** the add-on ID (permanent once uploaded to addons.mozilla.org), the minimum Firefox version (140, the first with `data_collection_permissions`) and the data the extension sends to the backend. Chrome ignores this key.
- **Expected lint warnings:** Firefox doesn't know the `tts` permission and ignores `background.service_worker`; `data_collection_permissions` needs Firefox for Android 142 (Android support is decided in #52). They're listed, with reasons, in [`.github/scripts/extension-lint-allowlist.json`](../.github/scripts/extension-lint-allowlist.json).
- **Expected Chrome warning:** `chrome://extensions` shows "'background.scripts' requires manifest version of 2 or lower". Chrome ignores the key and runs the service worker; it's the price of one manifest for both browsers. If the Chrome Web Store ever rejects it, the release can write a manifest per browser instead (#50).

## Configuration

`js/config.js`:

| Constant | Production | Local development |
| -------- | ---------- | ----------------- |
| `API_URL` | `https://tts-study-assistant-production.up.railway.app/api/v1` | `http://localhost:3000/api/v1` |
| `DASHBOARD_URL` | `https://tts-study-assistant.vercel.app` | `http://localhost:5173` |

The extension calls the API from its own pages and background. The API host is its own host permission, so requests with that access skip CORS and the backend's `CORS_ORIGINS` needs no entry for the extension (Firefox extension origins are random per install). Without that access, requests fail CORS, so the popup asks for it. If you point `API_URL` elsewhere, update that `host_permissions` entry too; `tests/manifest.test.mjs` checks they match.

## Website access

The selection button is a content script and needs access to the page's site; login and notes need access to the API host. Users can limit both: Chrome's "Site access: On click / On specific sites" withholds every host, including the API, and Firefox treats host permissions as optional (Add-ons → Permissions).

- **Popup:** a banner shows what's missing on the current tab, the site, the API host or both, and **Allow** asks for exactly those origins, never all websites, so a user's "On specific sites" choice stays as it is.
- **API without host access:** login and notes fail CORS until the user allows the API host from the banner.
- **Content script in open tabs:** on install, update, or when access is granted, the background adds the content script to open web pages. Chrome otherwise only adds it to pages loaded afterwards. A page may receive it twice (Firefox injects on install too). `content.js` skips a page where a live copy already runs, and removes a copy orphaned by an extension reload.
- **Shortcut and context menu:** they work without the content script and without website access. The shortcut reads the selection with `scripting.executeScript` under `activeTab`; *Play Text* plays from the background.
- **Pages extensions can't script:** browser pages and add-on stores. The shortcut shows a notification there.

| Permission | Why |
|---|---|
| `storage` | Settings and the login session |
| `tts` | Speech in Chrome (Firefox uses the Web Speech API) |
| `activeTab` | The current tab's URL and title for a note, and reading its selection from the shortcut |
| `scripting` | Reading the selection, and adding the content script to open tabs |
| `contextMenus` | Right-click → Study Assistant |
| `notifications` | Saved, summary and error messages |
| Host: the API | Login, notes and summaries without CORS, and when access to other sites is revoked |
| Host: `<all_urls>` | The selection button on every page |

## Features

- **Page selection:** a floating **Save & Play** / **Summarize** button; right-click → Study Assistant (Save, Play, Summarize); **Alt+Shift+Y** saves the selection and **Alt+Shift+S** opens the popup (change them at `chrome://extensions/shortcuts` or Firefox's Add-ons → ⚙ → Manage Extension Shortcuts). Alt+S was dropped because it opens Firefox's History menu on Windows and Linux.
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

Speech uses `chrome.tts` in Chrome. Firefox has no `chrome.tts`, so there `js/tts-webspeech.js` wraps the Web Speech API (`speechSynthesis`) in the same interface; `TtsEngine` drives either one. Neither reports durations.

- The total starts as an estimate: about 14 characters per second × speed.
- After 1.5 seconds of speech, it is re-derived from word-boundary events.
- So it can shift slightly at first, and stays an estimate for voices that don't emit word events (in Firefox this depends on the voice and OS).
- Seeking restarts speech at the start of the word nearest the chosen position.
- Changing the speed while playing continues from the current word at the new speed.

The engine lives in the background: Chrome's service worker, or Firefox's event page. If the browser stops it, the player state resets.

## Releasing

Releases are manual: merging to `main` publishes nothing.

1. **Bump the version** in `manifest.json` (and `package.json`) in your PR: patch for fixes, minor for features. The **Extension version bumped** check fails a PR that changes shipped files without raising the version above `main` and the latest release. The Chrome Web Store rejects same-version uploads.
2. **Merge the PR.**
3. **Tag the merge commit on `main` and push the tag:**
   ```sh
   git checkout main && git pull
   git tag -s extension-v0.2.1 -m "Extension v0.2.1"   # must equal manifest.json's version
   git push origin extension-v0.2.1
   ```
4. **The *Extension release* workflow** then:
   - checks that the tag matches `manifest.json` at that commit and that the commit is on `main`;
   - builds `tts-study-assistant-extension-v0.2.1.zip` with `.github/scripts/extension-package.sh` (runtime files only, `manifest.json` at the root) and runs the same package check as Extension CI;
   - creates the GitHub Release "Extension v0.2.1", with notes listing the `extension/` commits since the previous tag.
5. **Upload the zip** to the Chrome Web Store, or install it unpacked.

**Wrong tag?** If the workflow fails because the tag doesn't match the manifest, delete the tag and push a corrected one:
```sh
git push origin :refs/tags/extension-v0.2.1 && git tag -d extension-v0.2.1
```

## Tests

```sh
cd extension
npm test        # node:test, no dependencies: utils, playback (chrome.tts and Web Speech), background, content script, website access, manifest
```

The **Extension package and Firefox lint** CI job checks what actually ships. Run it locally from the repo root:

```sh
.github/scripts/extension-package.sh /tmp/ext.zip && rm -rf /tmp/ext && unzip -q /tmp/ext.zip -d /tmp/ext
node .github/scripts/extension-checks.mjs package /tmp/ext   # manifest at the root, both browsers' keys, no dev files, every referenced file present
npx web-ext@10.8.0 lint --source-dir /tmp/ext --output json > /tmp/lint.json
node .github/scripts/extension-checks.mjs lint /tmp/lint.json .github/scripts/extension-lint-allowlist.json
node --test .github/scripts/*.test.mjs                        # tests for the checks themselves
```

- **Lint errors** fail the job.
- **Warnings** fail unless the allowlist has a matching entry with a `reason`. Fix the warning when you can; allowlist it only when it's an intended difference between the browsers.
- **Allowlist entries** that no longer match any warning are flagged, so the list shrinks when a warning is fixed.

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
