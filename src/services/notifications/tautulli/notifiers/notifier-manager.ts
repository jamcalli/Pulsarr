/**
 * Tautulli Notifier Manager
 *
 * Handles syncing and ensuring user notifiers exist in Tautulli.
 */

import type {
  TautulliApiResponse,
  TautulliNotifier,
} from '@root/types/tautulli.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'
import { createUserNotifier } from './notifier-creator.js'

export interface NotifierManagerDeps {
  apiCall: <T = unknown>(
    cmd: string,
    params?: Record<string, unknown>,
  ) => Promise<TautulliApiResponse<T>>
  db: DatabaseService
  log: FastifyBaseLogger
  agentId: number
}

export interface TautulliEnabledUser {
  id: number
  username: string
  tautulli_notifier_id: number | null
}

/**
 * Get all configured notifiers from Tautulli
 */
export async function getNotifiers(
  deps: Pick<NotifierManagerDeps, 'apiCall' | 'log'>,
): Promise<TautulliNotifier[]> {
  const { apiCall, log } = deps

  try {
    const response = await apiCall<TautulliNotifier[]>('get_notifiers')
    return response?.response?.data || []
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : error },
      'Failed to get notifiers from Tautulli',
    )
    throw error
  }
}

/**
 * Create or update notification agents for all Plex users
 */
export async function syncUserNotifiers(
  deps: NotifierManagerDeps,
): Promise<void> {
  const { db, log } = deps

  try {
    // Get all Plex users with watchlist sync enabled
    const allUsers = await db.getAllUsers()
    const plexUsers = allUsers
      .filter((user) => user.can_sync)
      .map((user) => ({
        id: user.id,
        username: user.name,
        tautulli_notifier_id: user.tautulli_notifier_id,
      }))

    // Get existing notifiers from Tautulli
    const existingNotifiers = await getNotifiers(deps)

    for (const user of plexUsers) {
      await ensureUserNotifier(user, existingNotifiers, deps)
    }

    log.info(`Synced ${plexUsers.length} user notifiers with Tautulli`)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : error },
      'Failed to sync user notifiers',
    )
  }
}

/**
 * Ensure a user has a notification agent configured
 */
export async function ensureUserNotifier(
  user: TautulliEnabledUser,
  existingNotifiers: TautulliNotifier[],
  deps: NotifierManagerDeps,
): Promise<number | null> {
  const { db, log } = deps

  // Check if notifier already exists
  const existingNotifier = existingNotifiers.find(
    (n) => n.friendly_name === `Pulsarr - ${user.username}`,
  )

  if (existingNotifier) {
    // Update user record with notifier ID if needed
    if (user.tautulli_notifier_id !== existingNotifier.id) {
      await db.updateUser(user.id, {
        tautulli_notifier_id: existingNotifier.id,
      })
      log.debug(
        { username: user.username, notifierId: existingNotifier.id },
        'Updated database with existing Tautulli notifier ID',
      )
    }
    return existingNotifier.id
  }

  // Create new notifier for user
  try {
    const notifierId = await createUserNotifier(user, deps)

    // Update user record with notifier ID
    await db.updateUser(user.id, { tautulli_notifier_id: notifierId })

    return notifierId
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        user: user.username,
      },
      'Failed to create notifier for user',
    )
    return null
  }
}

/**
 * Remove a user's notifier from Tautulli
 */
export async function removeUserNotifier(
  userId: number,
  deps: NotifierManagerDeps,
): Promise<void> {
  const { apiCall, db, log } = deps

  // Get user with Tautulli info
  const user = await db.getUser(userId)

  if (!user || !user.tautulli_notifier_id) {
    return
  }

  try {
    // Remove from Tautulli
    await apiCall('delete_notifier', {
      notifier_id: user.tautulli_notifier_id,
    })

    // Update user record
    await db.updateUser(userId, { tautulli_notifier_id: null })

    log.info(
      { userId, notifierId: user.tautulli_notifier_id },
      'Removed user Tautulli notifier',
    )
  } catch (error) {
    log.error({ error, userId }, 'Failed to remove user notifier')
  }
}
