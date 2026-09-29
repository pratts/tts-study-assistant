import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setSessionEndHandler } from '@/lib/session'
import { db } from '@/test/handlers'
import { server } from '@/test/server'

// jsdom gaps that Radix UI and the theme provider rely on.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  db.reset()
  sessionStorage.clear()
  localStorage.clear()
  setSessionEndHandler(() => {})
})
afterAll(() => server.close())
