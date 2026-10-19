import { formatCount } from '@/lib/format'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type UserWithCount = components['schemas']['UserWithCount']

export const LINK_FIRST_REASON = 'Link a Plex account first.'

export function linkedToken(config: Pick<Config, 'plexTokens'>): string | null {
  return config.plexTokens[0] || null
}

export function hasFeeds(
  config: Pick<Config, 'selfRss' | 'friendsRss'>,
): boolean {
  return Boolean(config.selfRss || config.friendsRss)
}

/** Watchlist counts come from the users Pulsarr already synced, never a Plex call. */
export function watchlistCounts(users: readonly UserWithCount[]) {
  const owner = users.find((user) => user.is_primary_token) ?? null
  const friends = users.filter((user) => !user.is_primary_token)
  return {
    owner: owner ? formatCount(owner.watchlist_count, 'item') : 'Not synced',
    friends: `${formatCount(friends.length, 'friend')}, ${formatCount(
      friends.reduce((total, user) => total + user.watchlist_count, 0),
      'item',
    )}`,
  }
}

export function accountFacts({
  config,
  users,
  hasPlexPass,
  friendsSynced,
}: {
  config: Pick<Config, 'selfRss' | 'friendsRss'>
  users: readonly UserWithCount[]
  hasPlexPass: boolean
  friendsSynced: boolean
}): Array<{ label: string; value: string }> {
  const counts = watchlistCounts(users)
  return [
    { label: 'Plex Pass', value: hasPlexPass ? 'Yes' : 'No' },
    { label: 'Your watchlist', value: counts.owner },
    {
      label: "Friends' watchlists",
      value: friendsSynced ? counts.friends : 'Not synced',
    },
    {
      label: 'Sync mode',
      value: hasFeeds(config) ? 'RSS feeds' : 'Polling Plex',
    },
  ]
}
