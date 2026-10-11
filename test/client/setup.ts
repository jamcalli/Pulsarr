import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'
import { createFetchMock } from '../setup/fetch-mock.js'

const mock = createFetchMock([], 'error')

export const server = mock.server

// openapi-fetch captures globalThis.fetch at import, so the swap has to happen before any test file loads
mock.enable()

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  document.documentElement.className = ''
})

afterAll(() => {
  mock.disable()
})
