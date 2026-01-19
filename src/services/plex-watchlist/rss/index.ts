// RSS module exports for Plex watchlist service

export {
  detectRssCacheSettings,
  getCacheThresholdSeconds,
  type RssCacheInfo,
} from './rss-cache-detector.js'
export { mapRssItemsToWatchlist } from './rss-mapper.js'
