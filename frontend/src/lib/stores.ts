// Where to install the browser extension. The Firefox link has no locale, so
// addons.mozilla.org picks the visitor's language.
export const EXTENSION_STORES = [
  {
    title: 'Chrome Web Store',
    href: 'https://chromewebstore.google.com/detail/tts-study-assistant/lpnchhblldgnnjgmkbmanggilffhbnnp',
  },
  { title: 'Firefox Add-ons', href: 'https://addons.mozilla.org/firefox/addon/tts-study-assistant/' },
] as const
