import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach } from 'vitest'

export const server = setupServer()

// openapi-fetch captures globalThis.fetch at import, so MSW has to patch it before any test file loads
server.listen({ onUnhandledRequest: 'error' })

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  document.documentElement.className = ''
})

afterAll(() => {
  server.close()
})
