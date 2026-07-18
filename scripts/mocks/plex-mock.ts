/**
 * Local Plex Media Server mock for development / offline testing.
 *
 * Covers Pulsarr's local PMS surface: health checks, existence lookups,
 * labels, sessions, SSE notifications, and playlists.
 *
 * Seed GUIDs that should appear "on Plex" via:
 *   MOCK_PLEX_EXISTING_GUIDS=tmdb://123,tvdb://456
 *
 * Usage: bun run scripts/mocks/plex-mock.ts
 */

const port = Number(process.env.MOCK_PLEX_PORT ?? 32400)
const label = '[mock-plex]'

type PlexMetadata = {
  ratingKey: string
  key: string
  guid: string
  type: string
  title: string
  Label?: Array<{ tag: string }>
  [key: string]: unknown
}

type PlexPlaylist = {
  ratingKey: string
  key: string
  title: string
  type: string
  smart: boolean
  leafCount: number
}

const metadataByKey = new Map<string, PlexMetadata>()
const playlists: PlexPlaylist[] = []
let nextRatingKey = 1
let nextPlaylistId = 1

function parseExistingGuids(): Set<string> {
  const raw = process.env.MOCK_PLEX_EXISTING_GUIDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

const existingGuids = parseExistingGuids()

// Pre-seed metadata for configured GUIDs so /library/all and /library/metadata work.
for (const guid of existingGuids) {
  const ratingKey = String(nextRatingKey++)
  const type =
    guid.startsWith('tvdb://') || guid.startsWith('tvdb:') ? 'show' : 'movie'
  metadataByKey.set(ratingKey, {
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    guid,
    type,
    title: `Mock ${type} ${guid}`,
    Label: [],
  })
}

function emptyContainer() {
  return {
    MediaContainer: {
      size: 0,
      Metadata: [] as PlexMetadata[],
    },
  }
}

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

function normalizeGuid(guid: string): string {
  // Pulsarr may pass tmdb:123 or tmdb://123 — match either form.
  return guid.replace('://', ':')
}

function guidsMatch(a: string, b: string): boolean {
  return normalizeGuid(a) === normalizeGuid(b) || a === b
}

function findByGuid(guid: string): PlexMetadata[] {
  const results: PlexMetadata[] = []
  for (const item of metadataByKey.values()) {
    if (guidsMatch(item.guid, guid)) {
      results.push(item)
    }
  }
  return results
}

function ensureMetadata(ratingKey: string): PlexMetadata {
  let item = metadataByKey.get(ratingKey)
  if (!item) {
    item = {
      ratingKey,
      key: `/library/metadata/${ratingKey}`,
      guid: `plex://mock/${ratingKey}`,
      type: 'movie',
      title: `Mock Item ${ratingKey}`,
      Label: [],
    }
    metadataByKey.set(ratingKey, item)
  }
  return item
}

function applyLabelParams(item: PlexMetadata, url: URL): void {
  const clear = url.searchParams.has('label[].tag.tag-')
  if (clear) {
    item.Label = []
  }

  const labels = url.searchParams.getAll('label[].tag.tag').filter(Boolean)
  if (labels.length > 0) {
    item.Label = [...new Set(labels)].map((tag) => ({ tag }))
  }
}

function sseKeepAlive(): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      // Initial comment so EventSource considers the connection open.
      controller.enqueue(encoder.encode(': mock-plex connected\n\n'))
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(interval)
        }
      }, 15_000)
      // Bun may not expose cancel on all paths; interval is process-lifetime OK for mocks.
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export function startPlexMock(overridePort = port) {
  const server = Bun.serve({
    port: overridePort,
    hostname: '0.0.0.0',
    fetch(request) {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, '') || '/'
      const method = request.method.toUpperCase()

      if (method === 'GET' && path === '/identity') {
        return new Response(xmlIdentity(), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      if (method === 'GET' && path === '/library/sections') {
        return Response.json(jsonSections())
      }

      if (method === 'GET' && path === '/library/all') {
        const guid = url.searchParams.get('guid')
        const matches = guid ? findByGuid(guid) : []
        return Response.json({
          MediaContainer: {
            size: matches.length,
            Metadata: matches,
          },
        })
      }

      const metadataChildrenMatch = path.match(
        /^\/library\/metadata\/([^/]+)\/children$/,
      )
      if (method === 'GET' && metadataChildrenMatch) {
        return Response.json(emptyContainer())
      }

      const metadataMatch = path.match(/^\/library\/metadata\/([^/]+)$/)
      if (metadataMatch) {
        const ratingKey = metadataMatch[1]
        if (method === 'GET') {
          const item = metadataByKey.get(ratingKey)
          if (!item) {
            return Response.json(emptyContainer())
          }
          return Response.json({
            MediaContainer: {
              size: 1,
              Metadata: [item],
            },
          })
        }
        if (method === 'PUT') {
          const item = ensureMetadata(ratingKey)
          applyLabelParams(item, url)
          console.log(
            `${label} LABEL ratingKey=${ratingKey} labels=[${(item.Label ?? []).map((l) => l.tag).join(',')}]`,
          )
          return new Response(null, { status: 200 })
        }
      }

      if (method === 'GET' && path === '/status/sessions') {
        return Response.json({
          MediaContainer: {
            size: 0,
            Metadata: [],
          },
        })
      }

      if (method === 'GET' && path === '/:/eventsource/notifications') {
        console.log(`${label} SSE client connected`)
        return sseKeepAlive()
      }

      if (method === 'GET' && path === '/playlists') {
        return Response.json({
          MediaContainer: {
            size: playlists.length,
            Metadata: playlists,
          },
        })
      }

      if (method === 'POST' && path === '/playlists') {
        const title = url.searchParams.get('title') ?? 'Untitled'
        const type = url.searchParams.get('type') ?? 'video'
        const smart = url.searchParams.get('smart') === '1'
        const ratingKey = String(nextPlaylistId++)
        const playlist: PlexPlaylist = {
          ratingKey,
          key: `/playlists/${ratingKey}`,
          title,
          type,
          smart,
          leafCount: 0,
        }
        playlists.push(playlist)
        console.log(
          `${label} PLAYLIST created id=${ratingKey} title="${title}"`,
        )
        return Response.json({
          MediaContainer: {
            size: 1,
            Metadata: [playlist],
          },
        })
      }

      const playlistItemsMatch = path.match(/^\/playlists\/([^/]+)\/items$/)
      if (method === 'GET' && playlistItemsMatch) {
        return Response.json(emptyContainer())
      }

      // Section listings / search: empty results
      if (
        method === 'GET' &&
        (path.startsWith('/library/sections/') ||
          path === '/search' ||
          path === '/hubs/search')
      ) {
        return Response.json(emptyContainer())
      }

      console.log(`${label} ${method} ${path} → 404 (unhandled)`)
      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`${label} listening on http://localhost:${server.port}`)
  if (existingGuids.size > 0) {
    console.log(
      `${label} seeded ${existingGuids.size} GUID(s): ${[...existingGuids].join(', ')}`,
    )
  }
  return server
}

if (import.meta.main) {
  startPlexMock()
}
