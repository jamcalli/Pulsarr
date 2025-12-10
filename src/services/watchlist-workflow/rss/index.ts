/**
 * RSS Module
 *
 * Handles RSS feed processing for self and friends watchlists.
 */

export { enrichRssItems, type RssEnricherDeps } from './enricher.js'
export { processRssFriendsItems } from './friends-processor.js'
export { processRssSelfItems } from './self-processor.js'
