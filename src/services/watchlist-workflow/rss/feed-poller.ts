import type { WorkflowDeps } from '../types.js'
import { processRssFriendsItems } from './friends-processor.js'
import { processRssSelfItems } from './self-processor.js'

export async function checkRssFeeds(deps: WorkflowDeps): Promise<void> {
  try {
    if (!deps.state.rssFeedCache) {
      deps.logger.warn('RSS feed cache not initialized, skipping check')
      return
    }

    const token = deps.config.plexTokens?.[0]
    if (!token) {
      deps.logger.warn('No Plex token available for RSS check')
      return
    }

    const selfUrl = deps.config.selfRss
    const friendsUrl = deps.config.friendsRss

    if (selfUrl) {
      const selfResult = await deps.state.rssFeedCache.checkSelfFeed(
        selfUrl,
        token,
      )
      if (selfResult.changed && selfResult.newItems.length > 0) {
        deps.logger.info(
          { newItems: selfResult.newItems.length },
          'New items detected in self RSS feed',
        )
        await processRssSelfItems(selfResult.newItems, deps)
      }
    }

    if (friendsUrl) {
      const friendsResult = await deps.state.rssFeedCache.checkFriendsFeed(
        friendsUrl,
        token,
      )
      if (friendsResult.changed && friendsResult.newItems.length > 0) {
        deps.logger.info(
          { newItems: friendsResult.newItems.length },
          'New items detected in friends RSS feed',
        )
        await processRssFriendsItems(friendsResult.newItems, deps)
      }
    }
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error checking RSS feeds',
    )
  }
}
