# Chrome Extension — TTS Study Assistant

Quickly save and listen to notes from any website.

## Requirements

- Chrome browser

## Setup & Installation

1. **Build (if using a build step):**

   - (If using plain JS, skip. If using a bundler, run the build command.)

2. **Load the extension in Chrome:**

   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder

3. **Configuration:**
   - Set the backend API URL in the extension config (if applicable)

## Usage

- Click the extension icon to open the popup
- Save notes from the current page
- Listen to notes with built-in TTS

## Notes

- Passwords are pre-hashed before sending to the backend
- Requires a backend account
