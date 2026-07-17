/**
 * Start Radarr + Sonarr mock servers in one process.
 *
 * Usage: bun run scripts/mocks/run-arr-mocks.ts
 */

import { startRadarrMock } from './radarr-mock.ts'
import { startSonarrMock } from './sonarr-mock.ts'

startRadarrMock()
startSonarrMock()

console.log(
  '[mock-arr] Radarr + Sonarr mocks running. Point Pulsarr instances at:',
)
console.log(
  `  Radarr: http://localhost:${process.env.MOCK_RADARR_PORT ?? 7878} (API key: mock-api-key)`,
)
console.log(
  `  Sonarr: http://localhost:${process.env.MOCK_SONARR_PORT ?? 8989} (API key: mock-api-key)`,
)
