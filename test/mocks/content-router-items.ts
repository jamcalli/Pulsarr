import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { TmdbWatchProvider } from '@root/types/tmdb.types.js'

export interface LeafCase {
  name: string
  condition: Condition
  item: ContentItem
  context?: Partial<RoutingContext>
  expected: boolean | null
}

export const BASE_CONTEXT: RoutingContext = {
  userId: 1,
  userName: 'User 1',
  contentType: 'movie',
  itemKey: 'test-key',
}

export const SHOW_CONTEXT: Partial<RoutingContext> = { contentType: 'show' }

export const bareItem: ContentItem = {
  title: 'Bare Movie',
  type: 'movie',
  guids: ['tmdb:1'],
}

export function movie(
  overrides: Partial<ContentItem> = {},
  metadata: Partial<RadarrMovieLookupResponse> = {},
): ContentItem {
  return {
    title: 'Test Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    metadata: {
      id: 99999,
      tmdbId: 99999,
      title: 'Test Movie',
      year: 2020,
      ...metadata,
    },
    ...overrides,
  }
}

export function show(
  overrides: Partial<ContentItem> = {},
  metadata: Partial<SonarrSeriesLookupResponse> = {},
): ContentItem {
  return {
    title: 'Test Show',
    type: 'show',
    guids: ['tvdb:88888'],
    metadata: {
      id: 88888,
      tvdbId: 88888,
      title: 'Test Show',
      year: 2015,
      ...metadata,
    },
    ...overrides,
  }
}

export function provider(id: number, name: string): TmdbWatchProvider {
  return {
    display_priority: 1,
    logo_path: `/${id}.png`,
    provider_id: id,
    provider_name: name,
  }
}
