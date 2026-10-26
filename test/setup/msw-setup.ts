import { afterAll, afterEach, beforeAll } from 'vitest'
import { externalApiHandlers } from '../mocks/external-api-handlers.js'
import { plexApiHandlers } from '../mocks/plex-api-handlers.js'
import { createFetchMock } from './fetch-mock.js'

const mock = createFetchMock(
  [...plexApiHandlers, ...externalApiHandlers],
  'passthrough',
)

export const server = mock.server

beforeAll(() => {
  mock.enable()
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  mock.disable()
})
