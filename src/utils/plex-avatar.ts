import type { PlexUser } from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

// Avatar URLs (plex.tv/users/<uuid>/avatar) are the only stable global
// identity a session payload carries
export function extractUuidFromThumb(thumb: string | undefined): string | null {
  const match = thumb?.match(/plex\.tv\/users\/([a-f0-9]+)\/avatar/i)
  return match?.[1] ?? null
}

/** Server users keyed by their avatar thumb uuid. Warns on a thumb that carries no uuid. */
export function indexPlexUsersByUuid(
  users: PlexUser[],
  log: FastifyBaseLogger,
): Map<string, PlexUser> {
  const byUuid = new Map<string, PlexUser>()
  for (const user of users) {
    const uuid = extractUuidFromThumb(user.thumb)
    if (uuid) {
      byUuid.set(uuid, user)
    } else if (user.thumb) {
      log.warn(
        { thumb: user.thumb, username: user.username },
        'Could not extract UUID from server user thumb URL',
      )
    }
  }
  return byUuid
}
