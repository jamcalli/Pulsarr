import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, vi } from 'vitest'
import type * as Constants from '@/lib/constants'
import { createFetchMock } from '../setup/fetch-mock.js'

vi.mock('@/lib/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof Constants>()),
  MIN_LOADING_DELAY: 0,
}))

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
