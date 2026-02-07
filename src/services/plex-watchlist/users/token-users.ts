/**
 * Token Users Module
 *
 * Handles ensuring users exist for each Plex token in the configuration.
 * Fetches actual usernames from Plex API and manages primary user designation.
 */

import type { Config, User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface TokenUsersDeps {
  config: Config
  db: DatabaseService
  logger: FastifyBaseLogger
  fastify: FastifyInstance
}

/**
 * Creates default quota configurations for a newly created user using the quota service.
 *
 * @param userId - The user ID to create quotas for
 * @param deps - Service dependencies
 */
export async function createDefaultQuotasForUser(
  userId: number,
  deps: TokenUsersDeps,
): Promise<void> {
  try {
    const quotas = await deps.fastify.quotaService.setupDefaultQuotas(userId)

    const createdQuotas = []
    if (quotas.movieQuota) createdQuotas.push('movie')
    if (quotas.showQuota) createdQuotas.push('show')

    if (createdQuotas.length > 0) {
      deps.logger.debug(
        `Created default quotas for user ${userId}: ${createdQuotas.join(', ')}`,
      )
    }
  } catch (error) {
    deps.logger.error(
      { error, userId },
      'Failed to create default quotas for user',
    )
  }
}

/**
 * Ensures users exist for each Plex token in the configuration.
 *
 * Fetches the actual username from the Plex API for each token,
 * creates new users if needed, and updates existing users.
 * The first token is marked as the primary token user.
 *
 * @param deps - Service dependencies
 * @returns Promise resolving to a map of Plex usernames to user IDs
 */
export async function ensureTokenUsers(
  deps: TokenUsersDeps,
): Promise<Map<string, number>> {
  const userMap = new Map<string, number>()

  await Promise.all(
    deps.config.plexTokens.map(async (token, index) => {
      // Fetch the actual Plex username for this token
      let plexUsername = `token${index + 1}` // Fallback name
      let plexAvatar: string | null = null
      let plexUuid: string | null = null
      const isPrimary = index === 0 // First token is primary

      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000) // 10s timeout

      try {
        // Fetch the actual username from Plex API with timeout handling
        const response = await fetch('https://plex.tv/api/v2/user', {
          headers: {
            'User-Agent': USER_AGENT,
            'X-Plex-Token': token,
            Accept: 'application/json',
          },
          signal: controller.signal,
        })

        if (response.ok) {
          const userData = (await response.json()) as {
            username: string
            thumb?: string
            uuid?: string
          }
          if (userData?.username) {
            plexUsername = userData.username
            deps.logger.debug(
              `Using actual Plex username: ${plexUsername} for token${index + 1}`,
            )
          }
          if (userData?.thumb) {
            plexAvatar = userData.thumb
          }
          if (userData?.uuid) {
            plexUuid = userData.uuid
          }
        }
      } catch (error) {
        // Handle timeout errors specifically
        if (error instanceof Error && error.name === 'AbortError') {
          deps.logger.warn(
            `Timeout fetching Plex username for token${index + 1} after 10s, using fallback name`,
          )
        } else {
          deps.logger.error(
            { error, tokenIndex: index + 1 },
            'Failed to fetch Plex username for token',
          )
        }
        // Continue with the fallback name
      } finally {
        // Always clear the timeout to prevent memory leaks
        clearTimeout(timeoutId)
      }

      // Variable to hold our user
      let user: User | undefined

      // If this is the primary token, try to get the existing primary user
      if (isPrimary) {
        user = await deps.db.getPrimaryUser()
      }

      if (!user) {
        // Check if a user with this name already exists
        user = await deps.db.getUser(plexUsername)
      }

      if (user) {
        // If this user should be primary, update primary status first
        if (isPrimary && !user.is_primary_token) {
          await deps.db.setPrimaryUser(user.id)
        }

        // Build updates for any changed fields
        const updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> =
          {}
        if (user.name !== plexUsername) {
          updates.name = plexUsername
        }
        if (plexAvatar && user.avatar !== plexAvatar) {
          updates.avatar = plexAvatar
        }
        if (plexUuid && user.plex_uuid !== plexUuid) {
          updates.plex_uuid = plexUuid
        }

        if (Object.keys(updates).length > 0) {
          await deps.db.updateUser(user.id, updates)
          user = await deps.db.getUser(user.id)
        }
      } else {
        // If we're creating a primary user, ensure no other primaries exist
        if (isPrimary) {
          // Use the database service method to handle primary user setting
          // We'll create the user first, then set it as primary
          user = await deps.db.createUser({
            name: plexUsername,
            apprise: null,
            alias: null,
            discord_id: null,
            notify_apprise: false,
            notify_discord: false,
            notify_discord_mention: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: deps.config.newUserDefaultCanSync ?? true,
            requires_approval:
              deps.config.newUserDefaultRequiresApproval ?? false,
            is_primary_token: false, // Initially false, will set to true next
            avatar: plexAvatar,
            plex_uuid: plexUuid,
          })

          // Now set as primary using the database service method
          await deps.db.setPrimaryUser(user.id)

          // Reload to get updated data with is_primary_token = true
          const updatedUser = await deps.db.getUser(user.id)
          if (updatedUser) {
            // Send native webhook notification for user creation (fire-and-forget)
            void deps.fastify.notifications.sendUserCreated(updatedUser)
          }

          // Create default quotas for the new user
          await createDefaultQuotasForUser(user.id, deps)

          // Reload to get final data
          user = await deps.db.getUser(user.id)
        } else {
          // Create regular non-primary user
          user = await deps.db.createUser({
            name: plexUsername,
            apprise: null,
            alias: null,
            discord_id: null,
            notify_apprise: false,
            notify_discord: false,
            notify_discord_mention: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: deps.config.newUserDefaultCanSync ?? true,
            requires_approval:
              deps.config.newUserDefaultRequiresApproval ?? false,
            is_primary_token: false,
            avatar: plexAvatar,
            plex_uuid: plexUuid,
          })

          // Send native webhook notification for user creation (fire-and-forget)
          void deps.fastify.notifications.sendUserCreated(user)

          // Create default quotas for the new user
          await createDefaultQuotasForUser(user.id, deps)
        }
      }

      // Safety check for user ID
      if (!user || typeof user.id !== 'number') {
        throw new Error(`Failed to create or retrieve user ${plexUsername}`)
      }

      userMap.set(plexUsername, user.id)
      deps.logger.debug(`Mapped user ${plexUsername} to ID ${user.id}`)
    }),
  )

  deps.logger.debug(`Ensured users for ${deps.config.plexTokens.length} tokens`)
  return userMap
}
