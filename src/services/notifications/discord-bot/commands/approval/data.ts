import type { User } from '@root/types/config.types.js'
import { buildPosterUrl } from '@root/utils/poster-url.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface DataDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export async function getUserByDiscordId(
  discordId: string,
  deps: DataDeps,
): Promise<User | null> {
  try {
    const user = await deps.db.getUserByDiscordId(discordId)
    return user ?? null
  } catch (error) {
    deps.logger.error({ error, discordId }, 'Error getting user by Discord ID')
    return null
  }
}

export async function checkUserIsPrimary(
  discordUserId: string,
  deps: DataDeps,
): Promise<boolean> {
  try {
    const user = await getUserByDiscordId(discordUserId, deps)
    return user?.is_primary_token === true
  } catch (error) {
    deps.logger.error(
      { error, discordUserId },
      'Error checking primary user status',
    )
    return false
  }
}

export async function getAdminUserFromDiscord(
  discordUserId: string,
  deps: DataDeps,
): Promise<{ id: number; name: string } | null> {
  try {
    const user = await getUserByDiscordId(discordUserId, deps)

    if (!user?.is_primary_token) {
      return null
    }

    return {
      id: user.id,
      name: user.name,
    }
  } catch (error) {
    deps.logger.error(
      { error, discordUserId },
      'Error getting admin user from Discord',
    )
    return null
  }
}

export async function getPosterUrl(
  contentKey: string,
  deps: DataDeps,
): Promise<string | undefined> {
  try {
    const watchlistItems = await deps.db.getWatchlistItemsByKeys([contentKey])
    if (watchlistItems.length > 0 && watchlistItems[0].thumb) {
      return (
        buildPosterUrl(watchlistItems[0].thumb, 'notification') ?? undefined
      )
    }
    return undefined
  } catch (_error) {
    return undefined
  }
}
