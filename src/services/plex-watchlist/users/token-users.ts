import type { Config, User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { allSettledOrThrow } from '@utils/all-settled-or-throw.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface TokenUsersDeps {
  config: Config
  db: DatabaseService
  logger: FastifyBaseLogger
  fastify: FastifyInstance
}

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

export async function ensureTokenUsers(
  deps: TokenUsersDeps,
): Promise<Map<string, number>> {
  const userMap = new Map<string, number>()

  await allSettledOrThrow(
    deps.config.plexTokens.map(async (token, index) => {
      let plexUsername = `token${index + 1}`
      let usernameVerified = false
      let plexAvatar: string | null = null
      let plexUuid: string | null = null
      const isPrimary = index === 0

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)

      try {
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
            id?: number
            subscription?: { active: boolean }
          }
          if (userData?.username) {
            plexUsername = userData.username
            usernameVerified = true
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
          if (isPrimary && userData?.id !== undefined) {
            deps.fastify.plexServerService.setAdminPlexId(userData.id)
            const hasPlexPass = userData.subscription?.active ?? false
            deps.fastify.plexServerService.setHasPlexPass(hasPlexPass)
            deps.logger.debug(
              `Plex Pass status: ${hasPlexPass ? 'active' : 'not detected'}`,
            )
          }
        }
      } catch (error) {
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
      } finally {
        clearTimeout(timeoutId)
      }

      // Primary still proceeds unverified so a fresh install can bootstrap offline
      if (!isPrimary && !usernameVerified) {
        deps.logger.warn(
          `Skipping user sync for token${index + 1}: could not verify Plex username`,
        )
        return
      }

      let user: User | undefined

      if (isPrimary) {
        user = await deps.db.getPrimaryUser()
      }

      if (!user) {
        user = await deps.db.getUser(plexUsername)
      }

      if (user) {
        if (isPrimary && !user.is_primary_token) {
          await deps.db.setPrimaryUser(user.id)
        }

        const updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> =
          {}
        // Never overwrite a stored name with the fallback from a failed fetch
        if (usernameVerified && user.name !== plexUsername) {
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
        const { user: ensuredUser, created } = await deps.db.getOrCreateUser({
          name: plexUsername,
          apprise: null,
          alias: null,
          discord_id: null,
          notify_apprise: false,
          notify_discord: false,
          notify_discord_mention: true,
          notify_plex_mobile: false,
          can_sync: deps.config.newUserDefaultCanSync ?? true,
          requires_approval:
            deps.config.newUserDefaultRequiresApproval ?? false,
          is_primary_token: false,
          avatar: plexAvatar,
          plex_uuid: plexUuid,
        })
        user = ensuredUser

        if (isPrimary) {
          await deps.db.setPrimaryUser(user.id)
        }

        if (created) {
          // Reload so the notification carries the final primary flag
          const finalUser = await deps.db.getUser(user.id)
          if (finalUser) {
            void deps.fastify.notifications.sendUserCreated(finalUser)
          }

          await createDefaultQuotasForUser(user.id, deps)
        }

        if (isPrimary) {
          user = await deps.db.getUser(user.id)
        }
      }

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
