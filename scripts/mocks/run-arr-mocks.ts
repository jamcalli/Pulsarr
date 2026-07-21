/**
 * Start Radarr + Sonarr mock servers in one process.
 *
 * Usage: bun run scripts/mocks/run-arr-mocks.ts
 */

import { startRadarrMock } from './radarr-mock.js'
import { startSonarrMock } from './sonarr-mock.js'

startRadarrMock()
startSonarrMock()

console.log(
  '[mock-arr] Radarr + Sonarr mocks running. Point Pulsarr instances at:',
)
console.log(
  `  Radarr: http://localhost:${process.env.mockRadarrPort ?? 7878} (API key: mock-api-key)`,
)
console.log(
  `  Sonarr: http://localhost:${process.env.mockSonarrPort ?? 8989} (API key: mock-api-key)`,
)
