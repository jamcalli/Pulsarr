/**
 * Local Plex Media Server mock for development / offline testing.
 *
 * Covers the health-check surface used when skipIfExistsOnPlex is enabled:
 * GET /identity and GET /library/sections.
 *
 * Usage: bun run scripts/mocks/plex-mock.ts
 */

const port = Number(process.env.MOCK_PLEX_PORT ?? 32400)
const label = '[mock-plex]'

function xmlIdentity(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" apiVersion="1.0" claimed="1" machineIdentifier="mock-plex-machine" version="1.40.0">
</MediaContainer>`
}

function jsonSections() {
  // Health checks require at least one section (empty Directory keeps retrying).
  return {
    MediaContainer: {
      size: 2,
      allowSync: false,
      title1: 'Plex Library',
      Directory: [
        {
          key: '1',
          title: 'Movies',
          type: 'movie',
          agent: 'com.plexapp.agents.none',
          scanner: 'Plex Movie',
          language: 'en',
          uuid: 'mock-movies-section',
        },
        {
          key: '2',
          title: 'TV Shows',
          type: 'show',
          agent: 'com.plexapp.agents.none',
          scanner: 'Plex TV Series',
          language: 'en',
          uuid: 'mock-tv-section',
        },
      ],
    },
  }
}

export function startPlexMock(overridePort = port) {
  const server = Bun.serve({
    port: overridePort,
    hostname: '0.0.0.0',
    fetch(request) {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, '') || '/'

      if (request.method === 'GET' && path === '/identity') {
        return new Response(xmlIdentity(), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      if (request.method === 'GET' && path === '/library/sections') {
        return new Response(JSON.stringify(jsonSections()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Existence / search endpoints: empty results (content never "on plex")
      if (
        request.method === 'GET' &&
        (path.startsWith('/library/sections/') ||
          path.startsWith('/library/metadata/') ||
          path === '/search' ||
          path === '/hubs/search')
      ) {
        return new Response(
          JSON.stringify({
            MediaContainer: {
              size: 0,
              Metadata: [],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      console.log(`${label} ${request.method} ${path} → 404 (unhandled)`)
      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`${label} listening on http://localhost:${server.port}`)
  return server
}

if (import.meta.main) {
  startPlexMock()
}
