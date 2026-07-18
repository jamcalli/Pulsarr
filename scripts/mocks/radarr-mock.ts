/**
 * Local Radarr mock server for development / offline testing.
 *
 * Usage: bun run scripts/mocks/radarr-mock.ts
 */

import {
  type ArrMockRoute,
  json,
  noContent,
  notFound,
  readJsonBody,
  startArrMockServer,
} from './arr-mock-server.ts'
import {
  applyTags,
  createRadarrTmdbLookup,
  createSystemStatus,
  defaultTags,
  emptyPagedResult,
  parseApplyTagsMode,
  qualityProfiles,
  rootFolders,
} from './fixtures.ts'

const port = Number(process.env.MOCK_RADARR_PORT ?? 7878)
const label = '[mock-radarr]'

type Notification = Record<string, unknown> & { id: number; name: string }
type Movie = Record<string, unknown> & {
  id: number
  title: string
  tmdbId: number
  tags: number[]
}
type Tag = { id: number; label: string }

const notifications: Notification[] = []
const movies: Movie[] = []
const tags: Tag[] = [...defaultTags]
let nextNotificationId = 1
let nextMovieId = 1
let nextTagId = tags.reduce((max, tag) => Math.max(max, tag.id), 0) + 1

function createArrRoutes(): ArrMockRoute[] {
  return [
    {
      method: 'GET',
      path: 'system/status',
      handler: () => json(createSystemStatus('Radarr')),
    },
    {
      method: 'GET',
      path: 'qualityprofile',
      handler: () => json(qualityProfiles),
    },
    {
      method: 'GET',
      path: 'rootfolder',
      handler: () => json(rootFolders),
    },
    {
      method: 'GET',
      path: 'tag',
      handler: () => json(tags),
    },
    {
      method: 'POST',
      path: 'tag',
      handler: async (request) => {
        const body = await readJsonBody<{ label?: string }>(request)
        const labelText = body.label?.trim()
        if (!labelText) {
          return json({ message: 'label is required' }, 400)
        }

        const existing = tags.find((tag) => tag.label === labelText)
        if (existing) {
          return json(existing)
        }

        const tag = { id: nextTagId++, label: labelText }
        tags.push(tag)
        return json(tag)
      },
    },
    {
      method: 'DELETE',
      path: 'tag/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const index = tags.findIndex((tag) => tag.id === id)
        if (index === -1) {
          return notFound(`Tag ${id} not found`)
        }
        tags.splice(index, 1)
        return noContent()
      },
    },
    {
      method: 'GET',
      path: 'notification',
      handler: () => json(notifications),
    },
    {
      method: 'POST',
      path: 'notification',
      handler: async (request) => {
        const body = await readJsonBody<Record<string, unknown>>(request)
        const notification: Notification = {
          ...body,
          id: nextNotificationId++,
          name: String(body.name ?? 'Webhook'),
          implementationName: String(body.implementationName ?? 'Webhook'),
          implementation: String(body.implementation ?? 'Webhook'),
          configContract: String(body.configContract ?? 'WebhookSettings'),
          infoLink: String(
            body.infoLink ??
              'https://wiki.servarr.com/radarr/supported#webhook',
          ),
          tags: Array.isArray(body.tags) ? body.tags : [],
        }
        notifications.push(notification)
        console.log(
          `${label} WEBHOOK created id=${notification.id} name="${notification.name}"`,
        )
        return json(notification)
      },
    },
    {
      method: 'PUT',
      path: 'notification/:id',
      handler: async (request, _url, params) => {
        const id = Number(params.id)
        const index = notifications.findIndex((item) => item.id === id)
        if (index === -1) {
          return notFound(`Notification ${id} not found`)
        }
        const body = await readJsonBody<Record<string, unknown>>(request)
        const updated: Notification = {
          ...notifications[index],
          ...body,
          id,
          name: String(body.name ?? notifications[index].name),
        }
        notifications[index] = updated
        return json(updated)
      },
    },
    {
      method: 'DELETE',
      path: 'notification/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const index = notifications.findIndex((item) => item.id === id)
        if (index === -1) {
          return notFound(`Notification ${id} not found`)
        }
        const [removed] = notifications.splice(index, 1)
        console.log(
          `${label} WEBHOOK deleted id=${removed.id} name="${removed.name}"`,
        )
        return noContent()
      },
    },
    {
      method: 'GET',
      path: 'movie',
      handler: () => json(movies),
    },
    {
      method: 'GET',
      path: 'movie/lookup',
      handler: (_request, url) => {
        const term = url.searchParams.get('term') ?? ''
        const tmdbMatch = term.match(/tmdb:(\d+)/i)
        if (!tmdbMatch) {
          return json([])
        }

        const tmdbId = Number(tmdbMatch[1])
        const existing = movies.find((movie) => movie.tmdbId === tmdbId)
        if (existing) {
          return json([existing])
        }

        return json([createRadarrTmdbLookup(tmdbId)])
      },
    },
    {
      method: 'GET',
      path: 'movie/lookup/tmdb',
      handler: (_request, url) => {
        const tmdbId = Number(url.searchParams.get('tmdbId'))
        if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
          return json({ message: 'tmdbId is required' }, 400)
        }

        const existing = movies.find((movie) => movie.tmdbId === tmdbId)
        if (existing) {
          return json({
            ...createRadarrTmdbLookup(tmdbId, existing.title),
            ...existing,
          })
        }

        return json(createRadarrTmdbLookup(tmdbId))
      },
    },
    {
      method: 'POST',
      path: 'movie',
      handler: async (request) => {
        const body = await readJsonBody<{
          title?: string
          tmdbId?: number
          qualityProfileId?: number | string | null
          rootFolderPath?: string | null
          tags?: unknown[]
          monitored?: boolean
          minimumAvailability?: string
          addOptions?: Record<string, unknown>
        }>(request)

        const tmdbId = Number(body.tmdbId)
        if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
          return json({ message: 'tmdbId must be a positive integer' }, 400)
        }
        const title = body.title ?? `Mock Movie ${tmdbId}`
        const existing = movies.find((movie) => movie.tmdbId === tmdbId)
        if (existing) {
          console.log(
            `${label} ADD movie skipped (already exists) tmdb=${tmdbId} title="${title}"`,
          )
          return json(existing)
        }

        const movie: Movie = {
          id: nextMovieId++,
          title,
          tmdbId,
          year: 2024,
          qualityProfileId: body.qualityProfileId ?? 1,
          rootFolderPath: body.rootFolderPath ?? '/data/media',
          path: `${body.rootFolderPath ?? '/data/media'}/${title}`,
          monitored: body.monitored ?? true,
          hasFile: false,
          isAvailable: false,
          added: new Date().toISOString(),
          tags: Array.isArray(body.tags)
            ? body.tags
                .map((tag) => Number(tag))
                .filter((tag) => !Number.isNaN(tag))
            : [],
          minimumAvailability: body.minimumAvailability ?? 'released',
          addOptions: body.addOptions ?? {},
        }
        movies.push(movie)
        console.log(
          `${label} ADD movie tmdb=${tmdbId} title="${title}" id=${movie.id}`,
        )
        return json(movie)
      },
    },
    {
      method: 'PUT',
      path: 'movie/editor',
      handler: async (request) => {
        const body = await readJsonBody<{
          movieIds?: number[]
          tags?: number[]
          applyTags?: string
        }>(request)

        const movieIds = Array.isArray(body.movieIds) ? body.movieIds : []
        const tagIds = Array.isArray(body.tags) ? body.tags : []
        const mode = parseApplyTagsMode(body.applyTags)
        if (!mode) {
          return json(
            { message: 'applyTags must be add, remove, or replace' },
            400,
          )
        }

        for (const movieId of movieIds) {
          const movie = movies.find((item) => item.id === movieId)
          if (!movie) continue
          movie.tags = applyTags(movie.tags ?? [], tagIds, mode)
        }

        console.log(
          `${label} EDITOR movies=${movieIds.length} tags=[${tagIds.join(',')}] mode=${mode}`,
        )
        return noContent(202)
      },
    },
    {
      method: 'GET',
      path: 'movie/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const movie = movies.find((item) => item.id === id)
        if (!movie) {
          return notFound(`Movie ${id} not found`)
        }
        return json(movie)
      },
    },
    {
      method: 'PUT',
      path: 'movie/:id',
      handler: async (request, _url, params) => {
        const id = Number(params.id)
        const index = movies.findIndex((movie) => movie.id === id)
        if (index === -1) {
          return notFound(`Movie ${id} not found`)
        }
        const body = await readJsonBody<Record<string, unknown>>(request)
        const updated: Movie = {
          ...movies[index],
          ...body,
          id,
          title: String(body.title ?? movies[index].title),
          tmdbId: Number(body.tmdbId ?? movies[index].tmdbId),
          tags: Array.isArray(body.tags)
            ? body.tags
                .map((tag) => Number(tag))
                .filter((tag) => !Number.isNaN(tag))
            : (movies[index].tags ?? []),
        }
        movies[index] = updated
        return json(updated)
      },
    },
    {
      method: 'DELETE',
      path: 'movie/:id',
      handler: (_request, url, params) => {
        const id = Number(params.id)
        const index = movies.findIndex((movie) => movie.id === id)
        if (index === -1) {
          return notFound(`Movie ${id} not found`)
        }
        const [removed] = movies.splice(index, 1)
        console.log(
          `${label} DELETE movie id=${removed.id} title="${removed.title}" deleteFiles=${url.searchParams.get('deleteFiles') ?? 'false'}`,
        )
        return noContent()
      },
    },
    {
      method: 'GET',
      path: 'exclusions/paged',
      handler: () => json(emptyPagedResult()),
    },
  ]
}

export function startRadarrMock(overridePort = port) {
  return startArrMockServer({
    name: 'Radarr',
    port: overridePort,
    routes: createArrRoutes(),
  })
}

if (import.meta.main) {
  startRadarrMock()
}
