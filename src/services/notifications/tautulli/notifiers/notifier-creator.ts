/**
 * Tautulli Notifier Creator
 *
 * Handles creating and configuring new notifiers in Tautulli.
 */

import type {
  TautulliApiResponse,
  TautulliNotifier,
} from '@root/types/tautulli.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { TautulliEnabledUser } from './notifier-manager.js'

export interface NotifierCreatorDeps {
  apiCall: <T = unknown>(
    cmd: string,
    params?: Record<string, unknown>,
  ) => Promise<TautulliApiResponse<T>>
  log: FastifyBaseLogger
  agentId: number
}

/**
 * Get Plex user ID from Tautulli by username
 */
export async function getPlexUserId(
  username: string,
  deps: NotifierCreatorDeps,
): Promise<string | null> {
  const { apiCall, log } = deps

  try {
    const response =
      await apiCall<Array<{ user_id: string; username: string }>>('get_users')
    const users = response?.response?.data || []

    log.debug(
      {
        requestedUsername: username,
        availableUsers: users.map((u) => u.username),
        totalUsers: users.length,
      },
      'Searching for Plex user in Tautulli user list',
    )

    const user = users.find((u) => u.username === username)

    if (!user) {
      log.warn(
        {
          requestedUsername: username,
          availableUsers: users.map((u) => u.username),
        },
        'Username not found in Tautulli user list - this is likely the cause of agent creation failure',
      )
    }

    return user?.user_id || null
  } catch (error) {
    log.error({ error, username }, 'Failed to get Plex user ID from Tautulli')
    return null
  }
}

/**
 * Create a new notification agent for a user
 */
export async function createUserNotifier(
  user: TautulliEnabledUser,
  deps: NotifierCreatorDeps,
): Promise<number> {
  const { log } = deps

  log.debug(
    { user: user.username },
    'Starting Tautulli notifier creation process',
  )

  // Get the Plex user ID from Tautulli
  const plexUserId = await getPlexUserId(user.username, deps)

  if (!plexUserId) {
    const error = `Could not find Plex user ID for username: ${user.username}`
    log.error({ user: user.username, message: error })
    throw new Error(error)
  }

  log.debug(
    { user: user.username, plexUserId },
    'Found Plex user ID, creating basic notifier',
  )

  // Create the notifier and get ID
  const notifierId = await createBasicNotifier(user.username, deps)

  log.debug(
    { user: user.username, notifierId },
    'Basic notifier created, configuring settings',
  )

  // Configure the notifier with user settings
  await configureNotifier(notifierId, user.username, plexUserId, deps)

  log.debug(
    { user: user.username, notifierId, plexUserId },
    'Successfully created and configured Tautulli notifier for user',
  )
  return notifierId
}

/**
 * Create a basic notifier in Tautulli
 */
export async function createBasicNotifier(
  username: string,
  deps: NotifierCreatorDeps,
): Promise<number> {
  const { apiCall, log, agentId } = deps

  const createParams = {
    agent_id: agentId,
    friendly_name: `Pulsarr - ${username}`,
  }

  const createResponse = await apiCall('add_notifier_config', createParams)

  if (createResponse?.response?.result !== 'success') {
    const errorMsg =
      createResponse?.response?.message || 'Unknown error from Tautulli'
    log.error(
      { errorMsg, response: createResponse?.response },
      'Failed to create notifier',
    )
    throw new Error(`Failed to create notifier: ${errorMsg}`)
  }

  // Extract notifier ID from response
  return await extractNotifierId(createResponse, username, deps)
}

/**
 * Extract notifier ID from creation response or fetch it
 */
async function extractNotifierId(
  createResponse: TautulliApiResponse<unknown>,
  username: string,
  deps: NotifierCreatorDeps,
): Promise<number> {
  const { apiCall, log } = deps

  // Check if the response contains the notifier ID directly
  if (
    createResponse?.response?.data &&
    typeof createResponse.response.data === 'object' &&
    'notifier_id' in createResponse.response.data
  ) {
    return (createResponse.response.data as { notifier_id: number }).notifier_id
  }

  // Wait for the notifier to be created
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Get the newly created notifier ID
  const response = await apiCall<TautulliNotifier[]>('get_notifiers')
  const notifiers = response?.response?.data || []

  const newNotifier = notifiers.find(
    (n) => n.friendly_name === `Pulsarr - ${username}`,
  )

  if (!newNotifier) {
    log.error(
      {
        username,
        availableNotifiers: notifiers.map((n) => ({
          id: n.id,
          name: n.friendly_name,
        })),
      },
      'Created notifier not found',
    )
    throw new Error('Created notifier not found')
  }

  return newNotifier.id
}

/**
 * Configure a notifier with user-specific settings
 */
export async function configureNotifier(
  notifierId: number,
  username: string,
  plexUserId: string,
  deps: NotifierCreatorDeps,
): Promise<void> {
  const { apiCall, log, agentId } = deps

  const configParams = {
    notifier_id: notifierId,
    agent_id: agentId,
    friendly_name: `Pulsarr - ${username}`,
    plexmobileapp_user_ids: plexUserId, // Single user ID as string
    plexmobileapp_tap_action: 'preplay',
    on_play: 0,
    on_newdevice: 0,
    on_created: 0,
    custom_conditions: JSON.stringify([
      { parameter: '', operator: '', value: [], type: null },
    ]),
    custom_conditions_logic: 'and',
    on_play_subject: 'Tautulli ({server_name})',
    on_play_body: '{user} ({player}) started playing {title}.',
    on_newdevice_subject: 'Tautulli ({server_name})',
    on_newdevice_body: '{user} is streaming from a new device: {player}.',
    on_created_subject: 'Tautulli ({server_name})',
    on_created_body: '{title} was recently added to Plex.',
    test_subject: 'Tautulli',
    test_body: 'Test Notification',
  }

  const configResponse = await apiCall('set_notifier_config', configParams)

  if (configResponse?.response?.result !== 'success') {
    const errorMsg =
      configResponse?.response?.message || 'Unknown error from Tautulli'
    log.error(
      { errorMsg, response: configResponse?.response },
      'Failed to configure notifier',
    )
    throw new Error(`Failed to configure notifier: ${errorMsg}`)
  }
}
