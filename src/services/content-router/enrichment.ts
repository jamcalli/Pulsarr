import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
import type { TmdbWatchProviderData } from '@root/types/tmdb.types.js'
import {
  fetchListItemsBySlug,
  fetchUserListMetadata,
} from '@services/plex-watchlist/api/graphql.js'
import {
  extractImdbId,
  extractTmdbId,
  extractTvdbId,
  parseGenres,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

const LIST_CACHE_TTL_MS = 10_000

interface CachedListData {
  lists: Map<string, Set<string>>
  fetchedFor: Set<string>
  timestamp: number
}

const userListCache = new Map<number, CachedListData>()
const userListInflight = new Map<
  number,
  Promise<Map<string, Set<string>> | null>
>()

/**
 * Determines which types of enrichment are needed based on active router rules.
 * This optimization avoids unnecessary API calls by only fetching data that
 * active evaluators actually require.
 *
 * @param allRules - All router rules (should be cached by caller)
 * @param contentType - Type of content ('movie' or 'show')
 * @returns Object indicating which enrichment types are needed
 */
export function determineEnrichmentNeeds(
  allRules: Awaited<ReturnType<FastifyInstance['db']['getAllRouterRules']>>,
  contentType: 'movie' | 'show',
): {
  needsMetadata: boolean
  needsProviders: boolean
  needsAnimeCheck: boolean
  needsListCheck: boolean
  listNames: Set<string>
} {
  try {
    // Filter to enabled rules matching the current content type
    const enabledRules = allRules.filter((rule) => {
      if (!rule.enabled) return false
      // Only consider rules that apply to this content type
      if (contentType === 'movie') return rule.target_type === 'radarr'
      if (contentType === 'show') return rule.target_type === 'sonarr'
      return true
    })

    if (enabledRules.length === 0) {
      return {
        needsMetadata: false,
        needsProviders: false,
        needsAnimeCheck: false,
        needsListCheck: false,
        listNames: new Set(),
      }
    }

    // All rules are stored as 'conditional' type, so we need to check the criteria
    // to determine what enrichment data is needed
    let needsMetadata = false
    let needsProviders = false
    let needsAnimeCheck = false
    let needsListCheck = false
    const listNames = new Set<string>()

    const metadataFields = new Set([
      'certification',
      'language',
      'season',
      'year',
      'seriesStatus',
      'movieStatus',
    ])

    for (const rule of enabledRules) {
      if (rule.type === 'conditional' && rule.criteria) {
        walkCriteriaFields(rule.criteria, (field, value) => {
          if (metadataFields.has(field)) needsMetadata = true
          if (field === 'streamingServices') needsProviders = true
          if (
            field === 'genres' &&
            typeof value === 'string' &&
            value.toLowerCase().includes('anime')
          ) {
            needsAnimeCheck = true
          }
          if (field === 'plexList') {
            needsListCheck = true
            if (typeof value === 'string') {
              listNames.add(value.toLowerCase().trim())
            }
          }
        })

        // Short-circuit only when list rules aren't involved.
        // When needsListCheck is true we must scan all rules to
        // collect every referenced list name.
        if (
          !needsListCheck &&
          needsMetadata &&
          needsProviders &&
          needsAnimeCheck
        ) {
          break
        }
      }
    }

    return {
      needsMetadata,
      needsProviders,
      needsAnimeCheck,
      needsListCheck,
      listNames,
    }
  } catch (_error) {
    return {
      needsMetadata: true,
      needsProviders: true,
      needsAnimeCheck: true,
      needsListCheck: true,
      listNames: new Set(),
    }
  }
}

/**
 * Enriches a content item with additional metadata by making API calls to Radarr/Sonarr.
 * This is used to provide evaluators with more information for making routing decisions.
 * The enrichment happens once per routing operation to avoid duplicate API calls.
 *
 * @param fastify - Fastify instance for accessing services
 * @param log - Logger instance
 * @param allRules - All router rules (should be cached by caller)
 * @param item - The content item to enrich
 * @param context - Routing context with content type and other info
 * @returns Promise with the enriched content item
 */
export async function enrichItemMetadata(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  allRules: Awaited<ReturnType<FastifyInstance['db']['getAllRouterRules']>>,
  item: ContentItem,
  context: RoutingContext,
): Promise<ContentItem> {
  const isMovie = context.contentType === 'movie'

  // Determine which enrichment types are actually needed
  const enrichmentNeeds = determineEnrichmentNeeds(
    allRules,
    context.contentType,
  )

  // Skip all enrichment if nothing is needed
  if (
    !enrichmentNeeds.needsMetadata &&
    !enrichmentNeeds.needsProviders &&
    !enrichmentNeeds.needsAnimeCheck &&
    !enrichmentNeeds.needsListCheck
  ) {
    log.debug(
      `No enrichment needed for "${item.title}" (no matching rule types)`,
    )
    return item
  }

  // List membership only needs userId and itemKey, not GUIDs
  let listMemberships: Set<string> | undefined
  if (
    enrichmentNeeds.needsListCheck &&
    context.userId &&
    context.itemKey &&
    enrichmentNeeds.listNames.size > 0
  ) {
    try {
      listMemberships = await enrichListMemberships(
        fastify,
        log,
        context.userId,
        context.itemKey,
        enrichmentNeeds.listNames,
      )
    } catch (error) {
      log.debug(
        { error },
        `Failed to fetch list memberships for "${item.title}"`,
      )
    }
  }

  // Extract appropriate ID based on content type (tmdb for movies, tvdb for shows)
  let itemId: number | undefined

  if (isMovie) {
    itemId = extractTmdbId(item.guids)
  } else {
    itemId = extractTvdbId(item.guids)
  }

  // Determine if we can fetch metadata - only skip metadata enrichment if we can't get the ID
  // Other enrichment types (IMDB, providers, anime) can still run as they extract IDs independently
  const canFetchMetadata =
    enrichmentNeeds.needsMetadata && itemId && !Number.isNaN(itemId)

  if (enrichmentNeeds.needsMetadata && !canFetchMetadata) {
    log.debug(
      `Couldn't extract ${isMovie ? 'TMDB' : 'TVDB'} ID from item "${item.title}", skipping metadata enrichment only`,
    )
  }

  try {
    // Fetch metadata from appropriate API based on content type
    if (isMovie) {
      let movieMetadata: RadarrMovieLookupResponse | undefined
      let watchProviders: TmdbWatchProviderData | undefined
      let enrichedGenres: string[] | undefined

      // 1. Fetch Radarr metadata if needed (for certification, language, year rules)
      if (canFetchMetadata) {
        try {
          const defaultInstance = await fastify.db.getDefaultRadarrInstance()
          if (!defaultInstance) {
            log.warn('No default Radarr instance available for metadata lookup')
          } else {
            const lookupService = fastify.radarrManager.getRadarrService(
              defaultInstance.id,
            )

            if (lookupService) {
              log.debug(
                `Calling Radarr API for "${item.title}" with TMDB ID: ${itemId}`,
              )
              const apiResponse = await lookupService.getFromRadarr<
                RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
              >(`movie/lookup/tmdb?tmdbId=${itemId}`)

              // Handle both array and single object responses
              if (Array.isArray(apiResponse) && apiResponse.length > 0) {
                movieMetadata = apiResponse[0]
              } else if (!Array.isArray(apiResponse)) {
                movieMetadata = apiResponse
              }

              if (movieMetadata) {
                log.debug(`Radarr metadata fetched for "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.error(
            { error },
            `Failed to fetch Radarr metadata for "${item.title}"`,
          )
        }
      }

      // 2. Fetch TMDB watch providers if needed (for streaming rules)
      if (enrichmentNeeds.needsProviders && fastify.tmdb) {
        try {
          const tmdbId = extractTmdbId(item.guids)
          if (tmdbId) {
            const providers = await fastify.tmdb.getWatchProviders(
              tmdbId,
              'movie',
            )
            if (providers) {
              watchProviders = providers
              log.debug(`TMDB watch providers fetched for "${item.title}"`)
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch TMDB watch providers for "${item.title}"`,
          )
        }
      }

      // 4. Check anime status if needed (for conditional genre checks)
      if (enrichmentNeeds.needsAnimeCheck && fastify.anime) {
        try {
          const tvdbIdNum = extractTvdbId(item.guids)
          const tmdbIdNum = extractTmdbId(item.guids)
          const imdbIdNum = extractImdbId(item.guids)

          const tvdbId =
            tvdbIdNum && tvdbIdNum > 0 ? tvdbIdNum.toString() : undefined
          const tmdbId =
            tmdbIdNum && tmdbIdNum > 0 ? tmdbIdNum.toString() : undefined
          const imdbId =
            imdbIdNum && imdbIdNum > 0 ? imdbIdNum.toString() : undefined

          if (tvdbId || tmdbId || imdbId) {
            const isAnimeContent = await fastify.anime.isAnime(
              'movie',
              tvdbId,
              tmdbId,
              imdbId,
            )

            if (isAnimeContent) {
              const existingGenres = parseGenres(item.genres)
              const genresLowercase = existingGenres.map((g) => g.toLowerCase())

              if (!genresLowercase.includes('anime')) {
                enrichedGenres = [...existingGenres, 'anime']
                log.debug(`Anime genre added to "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to check anime status for "${item.title}"`,
          )
        }
      }

      // Return enriched item with all fetched data
      return {
        ...item,
        ...(movieMetadata && { metadata: movieMetadata }),
        ...(watchProviders && { watchProviders }),
        ...(enrichedGenres && { genres: enrichedGenres }),
        ...(listMemberships && { listMemberships }),
      }
    } else {
      let seriesMetadata: SonarrSeriesLookupResponse | undefined
      let watchProviders: TmdbWatchProviderData | undefined
      let enrichedGenres: string[] | undefined

      // 1. Fetch Sonarr metadata if needed (for certification, language, season, year rules)
      if (canFetchMetadata) {
        try {
          const defaultInstance = await fastify.db.getDefaultSonarrInstance()
          if (!defaultInstance) {
            log.warn('No default Sonarr instance available for metadata lookup')
          } else {
            const lookupService = fastify.sonarrManager.getSonarrService(
              defaultInstance.id,
            )

            if (lookupService) {
              log.debug(
                `Calling Sonarr API for "${item.title}" with TVDB ID: ${itemId}`,
              )
              const apiResponse = await lookupService.getFromSonarr<
                SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
              >(`series/lookup?term=tvdb:${itemId}`)

              // Handle both array and single object responses
              if (Array.isArray(apiResponse) && apiResponse.length > 0) {
                seriesMetadata = apiResponse[0]
              } else if (!Array.isArray(apiResponse)) {
                seriesMetadata = apiResponse
              }

              if (seriesMetadata) {
                log.debug(`Sonarr metadata fetched for "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.error(
            { error },
            `Failed to fetch Sonarr metadata for "${item.title}"`,
          )
        }
      }

      // 2. Fetch TMDB watch providers if needed (for streaming rules)
      if (enrichmentNeeds.needsProviders && fastify.tmdb) {
        try {
          const tmdbId = extractTmdbId(item.guids)
          if (tmdbId) {
            const providers = await fastify.tmdb.getWatchProviders(tmdbId, 'tv')
            if (providers) {
              watchProviders = providers
              log.debug(
                `TMDB watch providers fetched for TV show "${item.title}"`,
              )
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch TMDB watch providers for TV show "${item.title}"`,
          )
        }
      }

      // 4. Check anime status if needed (for conditional genre checks)
      if (enrichmentNeeds.needsAnimeCheck && fastify.anime) {
        try {
          const tvdbIdNum = extractTvdbId(item.guids)
          const tmdbIdNum = extractTmdbId(item.guids)
          const imdbIdNum = extractImdbId(item.guids)

          const tvdbId =
            tvdbIdNum && tvdbIdNum > 0 ? tvdbIdNum.toString() : undefined
          const tmdbId =
            tmdbIdNum && tmdbIdNum > 0 ? tmdbIdNum.toString() : undefined
          const imdbId =
            imdbIdNum && imdbIdNum > 0 ? imdbIdNum.toString() : undefined

          if (tvdbId || tmdbId || imdbId) {
            const isAnimeContent = await fastify.anime.isAnime(
              'show',
              tvdbId,
              tmdbId,
              imdbId,
            )

            if (isAnimeContent) {
              const existingGenres = parseGenres(item.genres)
              const genresLowercase = existingGenres.map((g) => g.toLowerCase())

              if (!genresLowercase.includes('anime')) {
                enrichedGenres = [...existingGenres, 'anime']
                log.debug(`Anime genre added to TV show "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to check anime status for TV show "${item.title}"`,
          )
        }
      }

      // Return enriched item with all fetched data
      return {
        ...item,
        ...(seriesMetadata && { metadata: seriesMetadata }),
        ...(watchProviders && { watchProviders }),
        ...(enrichedGenres && { genres: enrichedGenres }),
        ...(listMemberships && { listMemberships }),
      }
    }
  } catch (error) {
    log.error({ error }, `Error enriching metadata for "${item.title}"`)
  }

  // Return original item if enrichment failed
  return item
}

async function enrichListMemberships(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  userId: number,
  itemKey: string,
  ruleListNames: Set<string>,
): Promise<Set<string> | undefined> {
  const adminToken = fastify.config.plexTokens?.[0]
  if (!adminToken) return undefined

  const now = Date.now()
  for (const [cachedUserId, entry] of userListCache) {
    if (now - entry.timestamp >= LIST_CACHE_TTL_MS) {
      userListCache.delete(cachedUserId)
    }
  }

  const cached = userListCache.get(userId)
  if (cached && [...ruleListNames].every((n) => cached.fetchedFor.has(n))) {
    return buildMemberships(cached.lists, itemKey)
  }

  // Coalesce concurrent fetches for the same user so parallel
  // item enrichment doesn't fan out into duplicate GraphQL calls
  let inflight = userListInflight.get(userId)
  if (!inflight) {
    inflight = (async () => {
      const user = await fastify.db.getUser(userId)
      if (!user?.plex_uuid) return null

      const listMeta = await fetchUserListMetadata(
        adminToken,
        log,
        user.plex_uuid,
      )
      if (!listMeta) return null

      const relevantLists = listMeta.filter((list) => {
        const normalized = list.name.toLowerCase().trim()
        for (const ruleName of ruleListNames) {
          if (
            normalized === ruleName ||
            normalized.includes(ruleName) ||
            ruleName.includes(normalized)
          )
            return true
        }
        return false
      })

      const result = new Map<string, Set<string>>()
      for (const list of relevantLists) {
        const keys = await fetchListItemsBySlug(
          adminToken,
          log,
          list.slug,
          user.name,
        )
        result.set(list.name.toLowerCase().trim(), keys)
      }

      return result
    })()
    userListInflight.set(userId, inflight)
  }

  let result: Map<string, Set<string>> | null
  try {
    result = await inflight
  } finally {
    userListInflight.delete(userId)
  }

  if (!result) return undefined

  userListCache.set(userId, {
    lists: result,
    fetchedFor: new Set(ruleListNames),
    timestamp: Date.now(),
  })
  return buildMemberships(result, itemKey)
}

function buildMemberships(
  lists: Map<string, Set<string>>,
  itemKey: string,
): Set<string> {
  const memberships = new Set<string>()
  for (const [name, keys] of lists) {
    if (keys.has(itemKey)) {
      memberships.add(name)
    }
  }
  return memberships
}

function walkCriteriaFields(
  obj: unknown,
  visitor: (field: string, value: unknown) => void,
): void {
  if (!obj || typeof obj !== 'object') return

  const record = obj as Record<string, unknown>

  if (typeof record.field === 'string') {
    visitor(record.field, record.value)
  }

  if (record.condition) {
    walkCriteriaFields(record.condition, visitor)
  }

  if (Array.isArray(record.conditions)) {
    for (const child of record.conditions) {
      walkCriteriaFields(child, visitor)
    }
  }
}
