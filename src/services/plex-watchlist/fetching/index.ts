// Fetching layer exports for Plex watchlist service

// Friends API
export {
  cancelFriendRequest,
  getFriendRequests,
  getFriends,
  sendFriendRequest,
} from './friends-api.js'

// RSS fetching
export {
  fetchRawRssFeed,
  fetchWatchlistFromRss,
  generateStableKey,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from './rss-fetcher.js'

// Watchlist fetching
export { fetchSelfWatchlist, getOthersWatchlist } from './watchlist-fetcher.js'
