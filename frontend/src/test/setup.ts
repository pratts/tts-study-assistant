import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { db } from '@/test/handlers'
import { server } from '@/test/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  db.reset()
  sessionStorage.clear()
  localStorage.clear()
})
afterAll(() => server.close())
