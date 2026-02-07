import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  FriendRequestNode,
  FriendRequestsResult,
  FriendsResult,
  GraphQLQuery,
  PlexApiResponse,
} from '@root/types/plex.types.js'
import { USER_AGENT } from '@utils/version.js'
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
			  avatar
			  displayName
			}
			createdAt
		  }
		}`,
    }

    try {
      log.debug('Fetching friends with Plex token')
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
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
          (friend: {
            user: {
              id: string
              username: string
              avatar: string
              displayName: string
            }
            createdAt: string
          }) =>
            [
              {
                watchlistId: friend.user.id,
                username: friend.user.username,
                avatar: friend.user.avatar,
                displayName: friend.user.displayName,
                createdAt: friend.createdAt,
              },
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

/**
 * Fetches sent and received friend requests from the Plex GraphQL API.
 *
 * @param config - Application configuration containing Plex tokens
 * @param log - Fastify logger instance
 * @returns Promise resolving to sent/received friend request lists
 */
export const getFriendRequests = async (
  config: Config,
  log: FastifyBaseLogger,
): Promise<FriendRequestsResult> => {
  const token = config.plexTokens?.[0]
  if (!token) {
    log.warn('No Plex token configured for friend requests')
    return { sent: [], received: [], success: false }
  }

  const url = new URL('https://community.plex.tv/api')
  const query: GraphQLQuery = {
    query: `query GetFriendRequests {
      sent: friendRequests(first: 100, type: SENT) {
        nodes {
          user { id username avatar displayName }
          createdAt
        }
      }
      received: friendRequests(first: 100, type: RECEIVED) {
        nodes {
          user { id username avatar displayName }
          createdAt
        }
      }
    }`,
  }

  try {
    log.debug('Fetching friend requests from Plex')
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.warn(`Unable to fetch friend requests: ${response.statusText}`)
      return { sent: [], received: [], success: false }
    }

    const json = (await response.json()) as {
      errors?: Array<{ message: string }>
      data?: {
        sent?: { nodes: FriendRequestNode[] }
        received?: { nodes: FriendRequestNode[] }
      }
    }

    if (json.errors) {
      log.warn(
        `GraphQL errors fetching friend requests: ${JSON.stringify(json.errors)}`,
      )
      return { sent: [], received: [], success: false }
    }

    const sent = json.data?.sent?.nodes ?? []
    const received = json.data?.received?.nodes ?? []

    log.debug(
      `Friend requests: ${sent.length} sent, ${received.length} received`,
    )
    return { sent, received, success: true }
  } catch (err) {
    log.warn(`Unable to fetch friend requests: ${err}`)
    return { sent: [], received: [], success: false }
  }
}

/**
 * Sends a friend request to a Plex user via the GraphQL API.
 *
 * @param config - Application configuration containing Plex tokens
 * @param log - Fastify logger instance
 * @param uuid - The Plex user UUID to send the friend request to
 * @returns Promise resolving to success status
 */
export const sendFriendRequest = async (
  config: Config,
  log: FastifyBaseLogger,
  uuid: string,
): Promise<{ success: boolean }> => {
  const token = config.plexTokens?.[0]
  if (!token) {
    log.warn('No Plex token configured for sending friend request')
    return { success: false }
  }

  const url = new URL('https://community.plex.tv/api')
  const query: GraphQLQuery = {
    query: `mutation addFriend($input: FriendMutationInput!) {
      addFriend(input: $input)
    }`,
    variables: { input: { user: uuid } },
  }

  try {
    log.debug(`Sending friend request to user ${uuid}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.warn(`Unable to send friend request: ${response.statusText}`)
      return { success: false }
    }

    const json = (await response.json()) as {
      errors?: Array<{ message: string }>
      data?: { addFriend?: boolean }
    }

    if (json.errors) {
      log.warn(
        `GraphQL errors sending friend request: ${JSON.stringify(json.errors)}`,
      )
      return { success: false }
    }

    log.info(`Friend request sent to user ${uuid}`)
    return { success: true }
  } catch (err) {
    log.warn(`Unable to send friend request: ${err}`)
    return { success: false }
  }
}

/**
 * Cancels a pending sent friend request via the Plex GraphQL API.
 * Uses the removeFriend mutation which works on both friends and pending requests.
 *
 * @param config - Application configuration containing Plex tokens
 * @param log - Fastify logger instance
 * @param uuid - The Plex user UUID to cancel the friend request for
 * @returns Promise resolving to success status
 */
export const cancelFriendRequest = async (
  config: Config,
  log: FastifyBaseLogger,
  uuid: string,
): Promise<{ success: boolean }> => {
  const token = config.plexTokens?.[0]
  if (!token) {
    log.warn('No Plex token configured for canceling friend request')
    return { success: false }
  }

  const url = new URL('https://community.plex.tv/api')
  const query: GraphQLQuery = {
    query: `mutation removeFriend($input: RemoveFriendMutationInput!) {
      removeFriend(input: $input)
    }`,
    variables: { input: { user: uuid } },
  }

  try {
    log.debug(`Canceling friend request for user ${uuid}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.warn(`Unable to cancel friend request: ${response.statusText}`)
      return { success: false }
    }

    const json = (await response.json()) as {
      errors?: Array<{ message: string }>
      data?: { removeFriend?: boolean }
    }

    if (json.errors) {
      log.warn(
        `GraphQL errors canceling friend request: ${JSON.stringify(json.errors)}`,
      )
      return { success: false }
    }

    log.info(`Friend request canceled for user ${uuid}`)
    return { success: true }
  } catch (err) {
    log.warn(`Unable to cancel friend request: ${err}`)
    return { success: false }
  }
}
