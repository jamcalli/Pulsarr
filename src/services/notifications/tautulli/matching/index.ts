/**
 * Tautulli Matching Domain
 *
 * Handles matching pending notifications to items in Tautulli.
 */

export {
  createItemMatcher,
  type FindMatchingItemFn,
  type ItemMatcherDeps,
  isMediaTypeMatch,
  parseSeasonEpisode,
} from './item-matcher.js'

export {
  type GetRecentlyAddedFn,
  getMetadata,
  getPosterUrl,
  getRecentlyAdded,
  type MetadataFetcherDeps,
  searchByGuid,
} from './metadata-fetcher.js'
