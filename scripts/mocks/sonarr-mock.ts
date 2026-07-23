/**
 * Local Sonarr mock server for development / offline testing.
 *
 * Usage: bun run scripts/mocks/sonarr-mock.ts
 */

import {
  type ArrMockRoute,
  json,
  noContent,
  notFound,
  readJsonBody,
  startArrMockServer,
} from './arr-mock-server.js'
import {
  applyTags,
  createSonarrTvdbLookup,
  createSystemStatus,
  defaultTags,
  emptyPagedResult,
  type MockEpisode,
  type MockEpisodeFile,
  parseApplyTagsMode,
  qualityProfiles,
  recomputeSeriesAggregates,
  rootFolders,
  seedSeriesEpisodes,
} from './fixtures.js'

const port = Number(process.env.mockSonarrPort ?? 8989)
const label = '[mock-sonarr]'

type Notification = Record<string, unknown> & { id: number; name: string }
type Series = Record<string, unknown> & {
  id: number
  title: string
  tvdbId: number
  tags: number[]
}
type Tag = { id: number; label: string }

const notifications: Notification[] = []
const seriesList: Series[] = []
const episodes: MockEpisode[] = []
const episodeFiles: MockEpisodeFile[] = []
const tags: Tag[] = [...defaultTags]
let nextNotificationId = 1
let nextSeriesId = 1
let nextTagId = tags.reduce((max, tag) => Math.max(max, tag.id), 0) + 1
const nextEpisodeId = { value: 1 }
const nextEpisodeFileId = { value: 1 }

function createArrRoutes(): ArrMockRoute[] {
  return [
    {
      method: 'GET',
      path: 'system/status',
      handler: () => json(createSystemStatus('Sonarr')),
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
              'https://wiki.servarr.com/sonarr/supported#webhook',
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
      path: 'series',
      handler: (_request, url) => {
        const tvdbIdParam = url.searchParams.get('tvdbId')
        if (tvdbIdParam) {
          const tvdbId = Number(tvdbIdParam)
          return json(seriesList.filter((series) => series.tvdbId === tvdbId))
        }
        return json(seriesList)
      },
    },
    {
      method: 'GET',
      path: 'series/lookup',
      handler: (_request, url) => {
        const term = url.searchParams.get('term') ?? ''
        const tvdbMatch = term.match(/tvdb:(\d+)/i)
        if (!tvdbMatch) {
          return json([])
        }

        const tvdbId = Number(tvdbMatch[1])
        const existing = seriesList.find((series) => series.tvdbId === tvdbId)
        if (existing) {
          return json([existing])
        }

        return json([createSonarrTvdbLookup(tvdbId)])
      },
    },
    {
      method: 'POST',
      path: 'series',
      handler: async (request) => {
        const body = await readJsonBody<{
          title?: string
          tvdbId?: number
          qualityProfileId?: number | string | null
          rootFolderPath?: string | null
          tags?: unknown[]
          monitored?: boolean
          seasonFolder?: boolean
          seriesType?: string
          addOptions?: Record<string, unknown>
        }>(request)

        const tvdbId = Number(body.tvdbId)
        if (!Number.isInteger(tvdbId) || tvdbId <= 0) {
          return json({ message: 'tvdbId must be a positive integer' }, 400)
        }
        const title = body.title ?? `Mock Series ${tvdbId}`
        const existing = seriesList.find((series) => series.tvdbId === tvdbId)
        if (existing) {
          console.log(
            `${label} ADD series skipped (already exists) tvdb=${tvdbId} title="${title}"`,
          )
          return json(existing)
        }

        const seriesId = nextSeriesId++
        const seeded = seedSeriesEpisodes(
          seriesId,
          title,
          nextEpisodeId,
          nextEpisodeFileId,
        )
        episodes.push(...seeded.episodes)
        episodeFiles.push(...seeded.episodeFiles)

        const series: Series = {
          id: seriesId,
          title,
          tvdbId,
          year: 2024,
          qualityProfileId: body.qualityProfileId ?? 1,
          rootFolderPath: body.rootFolderPath ?? '/data/media',
          path: `${body.rootFolderPath ?? '/data/media'}/${title}`,
          monitored: body.monitored ?? true,
          seasonFolder: body.seasonFolder ?? true,
          seriesType: body.seriesType ?? 'standard',
          ended: false,
          status: 'continuing',
          added: new Date().toISOString(),
          tags: Array.isArray(body.tags)
            ? body.tags
                .map((tag) => Number(tag))
                .filter((tag) => !Number.isNaN(tag))
            : [],
          seasons: seeded.seasons,
          statistics: seeded.statistics,
          addOptions: body.addOptions ?? {},
        }
        seriesList.push(series)
        console.log(
          `${label} ADD series tvdb=${tvdbId} title="${title}" id=${series.id} episodes=${seeded.episodes.length}`,
        )
        return json(series)
      },
    },
    {
      method: 'PUT',
      path: 'series/editor',
      handler: async (request) => {
        const body = await readJsonBody<{
          seriesIds?: number[]
          tags?: number[]
          applyTags?: string
        }>(request)

        const seriesIds = Array.isArray(body.seriesIds) ? body.seriesIds : []
        const tagIds = Array.isArray(body.tags) ? body.tags : []
        const mode = parseApplyTagsMode(body.applyTags)
        if (!mode) {
          return json(
            { message: 'applyTags must be add, remove, or replace' },
            400,
          )
        }

        const updated: Series[] = []
        for (const seriesId of seriesIds) {
          const series = seriesList.find((item) => item.id === seriesId)
          if (!series) continue
          series.tags = applyTags(series.tags ?? [], tagIds, mode)
          updated.push(series)
        }

        console.log(
          `${label} EDITOR series=${seriesIds.length} tags=[${tagIds.join(',')}] mode=${mode}`,
        )
        return json(updated, 202)
      },
    },
    {
      method: 'GET',
      path: 'series/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const series = seriesList.find((item) => item.id === id)
        if (!series) {
          return notFound(`Series ${id} not found`)
        }
        return json(series)
      },
    },
    {
      method: 'PUT',
      path: 'series/:id',
      handler: async (request, _url, params) => {
        const id = Number(params.id)
        const index = seriesList.findIndex((series) => series.id === id)
        if (index === -1) {
          return notFound(`Series ${id} not found`)
        }
        const body = await readJsonBody<Record<string, unknown>>(request)
        const updated: Series = {
          ...seriesList[index],
          ...body,
          id,
          title: String(body.title ?? seriesList[index].title),
          tvdbId: Number(body.tvdbId ?? seriesList[index].tvdbId),
          tags: Array.isArray(body.tags)
            ? body.tags
                .map((tag) => Number(tag))
                .filter((tag) => !Number.isNaN(tag))
            : (seriesList[index].tags ?? []),
        }
        seriesList[index] = updated
        return json(updated)
      },
    },
    {
      method: 'DELETE',
      path: 'series/:id',
      handler: (_request, url, params) => {
        const id = Number(params.id)
        const index = seriesList.findIndex((series) => series.id === id)
        if (index === -1) {
          return notFound(`Series ${id} not found`)
        }
        const [removed] = seriesList.splice(index, 1)

        for (let i = episodes.length - 1; i >= 0; i--) {
          if (episodes[i].seriesId === id) {
            episodes.splice(i, 1)
          }
        }
        for (let i = episodeFiles.length - 1; i >= 0; i--) {
          if (episodeFiles[i].seriesId === id) {
            episodeFiles.splice(i, 1)
          }
        }

        console.log(
          `${label} DELETE series id=${removed.id} title="${removed.title}" deleteFiles=${url.searchParams.get('deleteFiles') ?? 'false'}`,
        )
        return noContent()
      },
    },
    {
      method: 'GET',
      path: 'episode',
      handler: (_request, url) => {
        const seriesId = Number(url.searchParams.get('seriesId'))
        if (!Number.isInteger(seriesId) || seriesId <= 0) {
          return json({ message: 'seriesId is required' }, 400)
        }

        let result = episodes.filter((ep) => ep.seriesId === seriesId)
        const seasonNumber = url.searchParams.get('seasonNumber')
        if (seasonNumber !== null) {
          const season = Number(seasonNumber)
          result = result.filter((ep) => ep.seasonNumber === season)
        }
        return json(result)
      },
    },
    {
      method: 'PUT',
      path: 'episode/monitor',
      handler: async (request) => {
        const body = await readJsonBody<{
          episodeIds?: number[]
          monitored?: boolean
        }>(request)

        const episodeIds = Array.isArray(body.episodeIds) ? body.episodeIds : []
        const monitored = body.monitored ?? true

        for (const episodeId of episodeIds) {
          const episode = episodes.find((ep) => ep.id === episodeId)
          if (episode) {
            episode.monitored = monitored
          }
        }

        console.log(
          `${label} EPISODE monitor count=${episodeIds.length} monitored=${monitored}`,
        )
        return json(episodes.filter((ep) => episodeIds.includes(ep.id)))
      },
    },
    {
      method: 'GET',
      path: 'episode/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const episode = episodes.find((ep) => ep.id === id)
        if (!episode) {
          return notFound(`Episode ${id} not found`)
        }
        return json(episode)
      },
    },
    {
      method: 'PUT',
      path: 'episode/:id',
      handler: async (request, _url, params) => {
        const id = Number(params.id)
        const index = episodes.findIndex((ep) => ep.id === id)
        if (index === -1) {
          return notFound(`Episode ${id} not found`)
        }
        const body = await readJsonBody<Partial<MockEpisode>>(request)
        const updated: MockEpisode = {
          ...episodes[index],
          ...body,
          id,
          seriesId: episodes[index].seriesId,
        }
        episodes[index] = updated
        return json(updated)
      },
    },
    {
      method: 'DELETE',
      path: 'episodefile/:id',
      handler: (_request, _url, params) => {
        const id = Number(params.id)
        const fileIndex = episodeFiles.findIndex((file) => file.id === id)
        if (fileIndex === -1) {
          return notFound(`Episode file ${id} not found`)
        }
        const [removed] = episodeFiles.splice(fileIndex, 1)
        const seriesId = removed.seriesId

        for (const episode of episodes) {
          if (episode.episodeFileId === id) {
            episode.episodeFileId = 0
            episode.hasFile = false
          }
        }

        const series = seriesList.find((item) => item.id === seriesId)
        if (series) {
          const seriesEpisodes = episodes.filter(
            (ep) => ep.seriesId === seriesId,
          )
          const seriesFiles = episodeFiles.filter(
            (file) => file.seriesId === seriesId,
          )
          const aggregates = recomputeSeriesAggregates(
            seriesEpisodes,
            seriesFiles,
          )
          series.seasons = aggregates.seasons
          series.statistics = aggregates.statistics
        }

        console.log(`${label} DELETE episodefile id=${id}`)
        return noContent()
      },
    },
    {
      method: 'GET',
      path: 'importlistexclusion/paged',
      handler: () => json(emptyPagedResult()),
    },
    {
      method: 'POST',
      path: 'command',
      handler: async (request) => {
        const body = await readJsonBody<{ name?: string }>(request)
        console.log(`${label} COMMAND ${body.name ?? 'unknown'}`)
        return json({
          id: Date.now(),
          name: body.name ?? 'Unknown',
          status: 'completed',
        })
      },
    },
  ]
}

export function startSonarrMock(overridePort = port) {
  return startArrMockServer({
    name: 'Sonarr',
    port: overridePort,
    routes: createArrRoutes(),
  })
}

if (import.meta.main) {
  startSonarrMock()
}
