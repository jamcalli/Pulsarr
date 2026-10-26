import type { PlexFriendStatus } from '@root/schemas/shared/plex-friend-status.schema.js'
import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface FriendStatusDeps {
  plexWatchlist: Pick<PlexWatchlistService, 'getClassifiedUsers'>
  logger: FastifyBaseLogger
}

export interface FriendStatusFields {
  friendStatus: PlexFriendStatus | null
  pendingSince: string | null
}

const UNKNOWN_STATUS: FriendStatusFields = {
  friendStatus: null,
  pendingSince: null,
}

/** Never throws. The primary token user is always self, and users Plex cannot classify (all others when Plex fails) get null status fields. */
export async function attachFriendStatus<
  T extends { plex_uuid?: string | null; is_primary_token: boolean },
>(users: T[], deps: FriendStatusDeps): Promise<(T & FriendStatusFields)[]> {
  let classified: Map<string, FriendStatusFields>
  try {
    const { users: classifiedUsers } =
      await deps.plexWatchlist.getClassifiedUsers()
    classified = new Map(
      classifiedUsers.map((user) => [
        user.uuid,
        { friendStatus: user.status, pendingSince: user.pendingSince },
      ]),
    )
  } catch (error) {
    deps.logger.warn(
      { error },
      'Plex user classification failed, returning users without friend status',
    )
    classified = new Map()
  }

  return users.map((user) => {
    if (user.is_primary_token) {
      return { ...user, friendStatus: 'self', pendingSince: null }
    }
    const status = user.plex_uuid ? classified.get(user.plex_uuid) : undefined
    return { ...user, ...(status ?? UNKNOWN_STATUS) }
  })
}
