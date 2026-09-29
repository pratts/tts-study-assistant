// Runs before first paint (loaded from index.html) so the page never flashes
// the wrong theme. Kept external so the CSP needs no 'unsafe-inline'.
// Keep the storage key in sync with src/components/theme-provider.tsx.
;(function () {
  var theme = 'system'
  try {
    theme = localStorage.getItem('theme') || 'system'
  } catch {
    // Storage can be unavailable (privacy modes); fall back to the system theme.
  }
  var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})()
