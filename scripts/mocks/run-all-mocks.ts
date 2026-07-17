/**
 * Start Radarr + Sonarr + Plex mock servers in one process.
 *
 * Usage: bun run scripts/mocks/run-all-mocks.ts
 */

import { startPlexMock } from './plex-mock.ts'
import { startRadarrMock } from './radarr-mock.ts'
import { startSonarrMock } from './sonarr-mock.ts'

startRadarrMock()
startSonarrMock()
startPlexMock()

console.log('[mock-all] Radarr + Sonarr + Plex mocks running.')
console.log(
  `  Radarr: http://localhost:${process.env.MOCK_RADARR_PORT ?? 7878} (API key: mock-api-key)`,
)
console.log(
  `  Sonarr: http://localhost:${process.env.MOCK_SONARR_PORT ?? 8989} (API key: mock-api-key)`,
)
console.log(`  Plex:   http://localhost:${process.env.MOCK_PLEX_PORT ?? 32400}`)
