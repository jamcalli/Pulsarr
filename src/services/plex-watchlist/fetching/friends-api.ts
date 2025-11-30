import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  FriendsResult,
  GraphQLQuery,
  PlexApiResponse,
} from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

/**
 * Fetches the list of friends from the Plex API for all configured tokens.
 *
 * @param config - Application configuration containing Plex tokens
 * @param log - Fastify logger instance
 * @returns Promise resolving to a FriendsResult containing friend data and status
 */
export const getFriends = async (
  config: Config,
  log: FastifyBaseLogger,
): Promise<FriendsResult> => {
  const allFriends = new Map<string, [Friend, string]>()
  let hasApiErrors = false
  let hasAnySuccess = false

  if (!config.plexTokens || config.plexTokens.length === 0) {
    log.warn('No Plex tokens configured')
    return {
      friends: new Set(allFriends.values()),
      success: false,
      hasApiErrors: true,
    }
  }

  for (const token of config.plexTokens) {
    // Skip falsy tokens to prevent predictable API failures
    if (!token) {
      continue
    }
    const url = new URL('https://community.plex.tv/api')
    const query: GraphQLQuery = {
      query: `query GetAllFriends {
		  allFriendsV2 {
			user {
			  id
			  username
			}
		  }
		}`,
    }

    try {
      log.debug('Fetching friends with Plex token')
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!response.ok) {
        log.warn(`Unable to fetch friends from Plex: ${response.statusText}`)
        hasApiErrors = true
        continue
      }

      const json = (await response.json()) as PlexApiResponse
      log.debug(`Response JSON: ${JSON.stringify(json)}`)
      if (json.errors) {
        log.warn(`GraphQL errors: ${JSON.stringify(json.errors)}`)
        hasApiErrors = true
        continue
      }

      if (json.data?.allFriendsV2) {
        const friends = json.data.allFriendsV2.map(
          (friend: { user: { id: string; username: string } }) =>
            [
              { watchlistId: friend.user.id, username: friend.user.username },
              token,
            ] as [Friend, string],
        )

        if (friends.length === 0) {
          log.warn('No friends found for Plex token')
          // Note: Empty friends list is not an API error - user may legitimately have no friends
        }

        for (const friend of friends) {
          // Use watchlistId as the unique key to deduplicate friends across tokens
          allFriends.set(friend[0].watchlistId, friend)
          log.debug(
            `Added friend: ${friend[0].username} (watchlistId: ${friend[0].watchlistId})`,
          )
        }

        // Mark as successful if we got a valid response (even if empty)
        hasAnySuccess = true
      }
    } catch (err) {
      log.warn(`Unable to fetch friends from Plex: ${err}`)
      hasApiErrors = true
    }
  }

  // Convert Map to Set for return value to maintain API compatibility
  const friendsSet = new Set(allFriends.values())

  const result: FriendsResult = {
    friends: friendsSet,
    success: hasAnySuccess,
    hasApiErrors,
  }

  if (hasAnySuccess) {
    log.debug(
      `Friends fetched successfully. Got ${friendsSet.size} unique friends${hasApiErrors ? ' (with some API errors)' : ''}`,
    )
  } else {
    log.error('Failed to fetch friends from any token')
  }

  return result
}
