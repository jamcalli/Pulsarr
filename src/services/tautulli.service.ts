import type { FastifyInstance, FastifyBaseLogger } from 'fastify'
import type {
  TautulliConfig,
  TautulliMetadata,
  TautulliNotifier,
  TautulliNotificationRequest,
  TautulliApiResponse,
  TautulliEnabledUser,
  PendingNotification,
  RecentlyAddedItem,
} from '@root/types/tautulli.types.js'
import type { DatabaseService } from './database.service.js'
import type { User } from '@root/types/config.types.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import { normalizeGuid } from '@root/utils/guid-handler.js'

export class TautulliService {
  private db: DatabaseService
  private isInitialized = false

  // Constants
  private readonly PLEXMOBILEAPP_AGENT_ID = 26 // Plex mobile app agent ID

  /**
   * Check if Tautulli service is active (initialized and enabled)
   */
  private get isActive(): boolean {
    return this.isInitialized && this.config.enabled
  }

  /**
   * Safely parse season and episode numbers from Tautulli API response
   *
   * @param item - The Tautulli recently added item
   * @returns Object with parsed season and episode numbers, or null values if parsing fails
   */
  private parseSeasonEpisode(item: RecentlyAddedItem): {
    season: number | null
    episode: number | null
  } {
    let season: number | null = null
    let episode: number | null = null

    // Try parsing from string fields first (newer API format)
    if (item.parent_media_index) {
      const parsedSeason = Number.parseInt(item.parent_media_index, 10)
      if (!Number.isNaN(parsedSeason)) {
        season = parsedSeason
      }
    }

    if (item.media_index) {
      const parsedEpisode = Number.parseInt(item.media_index, 10)
      if (!Number.isNaN(parsedEpisode)) {
        episode = parsedEpisode
      }
    }

    // Fallback to legacy number fields if string parsing failed
    if (season === null && typeof item.season === 'number') {
      season = item.season
    }

    if (episode === null && typeof item.episode === 'number') {
      episode = item.episode
    }

    // Log warning if we have string fields but they couldn't be parsed
    if (
      (item.parent_media_index && season === null) ||
      (item.media_index && episode === null)
    ) {
      this.log.warn(
        {
          parent_media_index: item.parent_media_index,
          media_index: item.media_index,
          title: item.title,
          rating_key: item.rating_key,
        },
        'Invalid media index values from Tautulli API',
      )
    }

    return { season, episode }
  }

  // Polling system properties
  private pendingNotifications = new Map<string, PendingNotification>()
  private pollInterval: NodeJS.Timeout | null = null
  private readonly POLL_INTERVAL_MS = 30000 // 30 seconds - more aggressive for better UX
  private readonly MAX_ATTEMPTS = 20 // 10 minutes total with 30s intervals
  private readonly MAX_AGE_MS = 1800000 // 30 minutes max age
  private isPolling = false

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.db = fastify.db
  }

  private get config(): TautulliConfig {
    return {
      url: this.fastify.config.tautulliUrl || '',
      apiKey: this.fastify.config.tautulliApiKey || '',
      enabled: this.fastify.config.tautulliEnabled || false,
    }
  }

  /**
   * Initialize Tautulli integration
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    if (!this.config.url || !this.config.apiKey) {
      this.fastify.log.warn('Tautulli URL or API key not configured')
      return
    }

    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Test connection
        const isConnected = await this.testConnection()
        if (!isConnected) {
          throw new Error('Failed to connect to Tautulli')
        }

        // Save config to database
        await this.saveConfig()

        this.fastify.log.info('Tautulli integration enabled successfully')
        this.isInitialized = true

        return
      } catch (error) {
        if (attempt === maxRetries) {
          this.fastify.log.error(
            { error },
            'Failed to initialize Tautulli integration after all retries',
          )
          // No-op: config is not mutable; rely on isInitialized=false gates
        } else {
          this.fastify.log.warn(
            { error, attempt, maxRetries },
            'Tautulli initialization failed, retrying...',
          )
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt))
        }
      }
    }
  }

  /**
   * Gracefully shutdown the service
   */
  async shutdown(): Promise<void> {
    this.stopPolling()
    this.isInitialized = false
  }

  /**
   * Test connection to Tautulli
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiCall<{ result: string }>('arnold')
      return response?.response?.result === 'success'
    } catch {
      return false
    }
  }

  /**
   * Make an API call to Tautulli
   */
  private async apiCall<T = unknown>(
    cmd: string,
    params: Record<string, unknown> = {},
  ): Promise<TautulliApiResponse<T>> {
    const url = new URL(`${this.config.url}/api/v2`)

    const searchParams = new URLSearchParams({
      apikey: this.config.apiKey,
      cmd,
      ...Object.entries(params).reduce(
        (acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value)
          }
          return acc
        },
        {} as Record<string, string>,
      ),
    })

    url.search = searchParams.toString()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(
          `Tautulli API error: ${response.status} ${response.statusText}`,
        )
      }

      return response.json() as Promise<TautulliApiResponse<T>>
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
  }

  /**
   * Save Tautulli configuration to database
   */
  private async saveConfig(): Promise<void> {
    const currentConfig = await this.db.getConfig()
    if (currentConfig) {
      await this.db.updateConfig({
        tautulliEnabled: this.config.enabled,
        tautulliUrl: this.config.url,
        tautulliApiKey: this.config.apiKey,
      })
    }
  }

  /**
   * Create or update notification agents for all Plex users
   */
  async syncUserNotifiers(): Promise<void> {
    if (!this.isActive) return

    try {
      // Get all Plex users with watchlist sync enabled
      const allUsers = await this.db.getAllUsers()
      const plexUsers = allUsers
        .filter((user) => user.can_sync)
        .map((user) => ({
          id: user.id,
          username: user.name,
          tautulli_notifier_id: user.tautulli_notifier_id,
        }))

      // Get existing notifiers from Tautulli
      const existingNotifiers = await this.getNotifiers()

      for (const user of plexUsers) {
        await this.ensureUserNotifier(user, existingNotifiers)
      }

      this.fastify.log.info(
        `Synced ${plexUsers.length} user notifiers with Tautulli`,
      )
    } catch (error) {
      this.fastify.log.error(
        {
          error: error instanceof Error ? error.message : error,
        },
        'Failed to sync user notifiers',
      )
    }
  }

  /**
   * Get all configured notifiers from Tautulli
   */
  private async getNotifiers(): Promise<TautulliNotifier[]> {
    try {
      const response = await this.apiCall<TautulliNotifier[]>('get_notifiers')
      return response?.response?.data || []
    } catch (error) {
      this.fastify.log.error(
        {
          error: error instanceof Error ? error.message : error,
        },
        'Failed to get notifiers from Tautulli',
      )
      throw error
    }
  }

  /**
   * Ensure a user has a notification agent configured
   */
  private async ensureUserNotifier(
    user: TautulliEnabledUser,
    existingNotifiers: TautulliNotifier[],
  ): Promise<number | null> {
    // Check if notifier already exists
    const existingNotifier = existingNotifiers.find(
      (n) => n.friendly_name === `Pulsarr - ${user.username}`,
    )

    if (existingNotifier) {
      // Update user record with notifier ID if needed
      if (user.tautulli_notifier_id !== existingNotifier.id) {
        await this.db.updateUser(user.id, {
          tautulli_notifier_id: existingNotifier.id,
        })
        this.fastify.log.debug(
          { username: user.username, notifierId: existingNotifier.id },
          'Updated database with existing Tautulli notifier ID',
        )
      }
      return existingNotifier.id
    }

    // Create new notifier for user
    try {
      const notifierId = await this.createUserNotifier(user)

      // Update user record with notifier ID
      await this.db.updateUser(user.id, { tautulli_notifier_id: notifierId })

      return notifierId
    } catch (error) {
      this.fastify.log.error(
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
   * Get Plex user ID from Tautulli by username
   */
  private async getPlexUserId(username: string): Promise<string | null> {
    try {
      const response =
        await this.apiCall<Array<{ user_id: string; username: string }>>(
          'get_users',
        )
      const users = response?.response?.data || []

      this.fastify.log.debug(
        {
          requestedUsername: username,
          availableUsers: users.map((u) => u.username),
          totalUsers: users.length,
        },
        'Searching for Plex user in Tautulli user list',
      )

      const user = users.find((u) => u.username === username)

      if (!user) {
        this.fastify.log.warn(
          {
            requestedUsername: username,
            availableUsers: users.map((u) => u.username),
          },
          'Username not found in Tautulli user list - this is likely the cause of agent creation failure',
        )
      }

      return user?.user_id || null
    } catch (error) {
      this.fastify.log.error(
        { error, username },
        'Failed to get Plex user ID from Tautulli',
      )
      return null
    }
  }

  /**
   * Create a new notification agent for a user
   */
  private async createUserNotifier(user: TautulliEnabledUser): Promise<number> {
    this.fastify.log.debug(
      { user: user.username },
      'Starting Tautulli notifier creation process',
    )

    // Get the Plex user ID from Tautulli
    const plexUserId = await this.getPlexUserId(user.username)

    if (!plexUserId) {
      const error = `Could not find Plex user ID for username: ${user.username}`
      this.fastify.log.error({ user: user.username }, error)
      throw new Error(error)
    }

    this.fastify.log.debug(
      { user: user.username, plexUserId },
      'Found Plex user ID, creating basic notifier',
    )

    // Create the notifier and get ID
    const notifierId = await this.createBasicNotifier(user.username)

    this.fastify.log.debug(
      { user: user.username, notifierId },
      'Basic notifier created, configuring settings',
    )

    // Configure the notifier with user settings
    await this.configureNotifier(notifierId, user.username, plexUserId)

    this.fastify.log.debug(
      { user: user.username, notifierId, plexUserId },
      'Successfully created and configured Tautulli notifier for user',
    )
    return notifierId
  }

  /**
   * Create a basic notifier in Tautulli
   */
  private async createBasicNotifier(username: string): Promise<number> {
    const createParams = {
      agent_id: this.PLEXMOBILEAPP_AGENT_ID,
      friendly_name: `Pulsarr - ${username}`,
    }

    const createResponse = await this.apiCall(
      'add_notifier_config',
      createParams,
    )

    if (createResponse?.response?.result !== 'success') {
      const errorMsg =
        createResponse?.response?.message || 'Unknown error from Tautulli'
      this.fastify.log.error(
        `Failed to create notifier: ${errorMsg}`,
        createResponse,
      )
      throw new Error(`Failed to create notifier: ${errorMsg}`)
    }

    // Extract notifier ID from response
    return await this.extractNotifierId(createResponse, username)
  }

  /**
   * Extract notifier ID from creation response or fetch it
   */
  private async extractNotifierId(
    createResponse: TautulliApiResponse<unknown>,
    username: string,
  ): Promise<number> {
    // Check if the response contains the notifier ID directly
    if (
      createResponse?.response?.data &&
      typeof createResponse.response.data === 'object' &&
      'notifier_id' in createResponse.response.data
    ) {
      return (createResponse.response.data as { notifier_id: number })
        .notifier_id
    }

    // Wait for the notifier to be created
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the newly created notifier ID
    const notifiers = await this.getNotifiers()

    const newNotifier = notifiers.find(
      (n) => n.friendly_name === `Pulsarr - ${username}`,
    )

    if (!newNotifier) {
      this.fastify.log.error(
        `Created notifier not found for ${username}. Available notifiers:`,
        notifiers.map((n) => ({ id: n.id, name: n.friendly_name })),
      )
      throw new Error('Created notifier not found')
    }

    return newNotifier.id
  }

  /**
   * Configure a notifier with user-specific settings
   */
  private async configureNotifier(
    notifierId: number,
    username: string,
    plexUserId: string,
  ): Promise<void> {
    const configParams = {
      notifier_id: notifierId,
      agent_id: this.PLEXMOBILEAPP_AGENT_ID,
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

    const configResponse = await this.apiCall(
      'set_notifier_config',
      configParams,
    )

    if (configResponse?.response?.result !== 'success') {
      const errorMsg =
        configResponse?.response?.message || 'Unknown error from Tautulli'
      this.fastify.log.error(
        `Failed to configure notifier: ${errorMsg}`,
        configResponse,
      )
      throw new Error(`Failed to configure notifier: ${errorMsg}`)
    }
  }

  /**
   * Get media metadata from Tautulli
   */
  async getMetadata(ratingKey: string): Promise<TautulliMetadata | null> {
    if (!this.isActive) return null

    try {
      const response = await this.apiCall<TautulliMetadata>('get_metadata', {
        rating_key: ratingKey,
      })

      return response?.response?.data || null
    } catch (error) {
      this.fastify.log.error(
        { error, ratingKey },
        'Failed to get metadata from Tautulli',
      )
      return null
    }
  }

  /**
   * Search for media by GUID
   */
  async searchByGuid(guid: string): Promise<TautulliMetadata | null> {
    if (!this.isActive) return null

    try {
      const response = await this.apiCall<{ results: TautulliMetadata[] }>(
        'search',
        {
          query: guid,
        },
      )

      const results = response?.response?.data?.results || []
      return results[0] || null
    } catch (error) {
      this.fastify.log.error({ error, guid }, 'Failed to search Tautulli')
      return null
    }
  }

  /**
   * Get poster URL through Tautulli's image proxy
   */
  private getPosterUrl(thumb: string, ratingKey: string): string {
    const params = new URLSearchParams({
      apikey: this.config.apiKey,
      cmd: 'pms_image_proxy',
      img: thumb,
      rating_key: ratingKey,
      width: '300',
      height: '450',
      fallback: 'poster',
    })

    return `${this.config.url}/api/v2?${params.toString()}`
  }

  /**
   * Queue a notification to be sent when content appears in Tautulli
   *
   * @param guid - The GUID of the content (e.g., "tmdb://12345")
   * @param mediaType - Type of media (movie, show, episode)
   * @param interestedUsers - Array of users to notify
   * @param metadata - Additional metadata about the content
   */
  async queueNotification(
    guid: string,
    mediaType: 'movie' | 'show' | 'episode',
    interestedUsers: Array<{
      userId: number
      username: string
      notifierId: number
    }>,
    metadata: {
      title: string
      watchlistItemId: number
      watchlistItemKey?: string
      seasonNumber?: number
      episodeNumber?: number
    },
  ): Promise<void> {
    if (!this.isActive || interestedUsers.length === 0) {
      return
    }

    // Filter out users without valid notifier IDs and create notifiers for them
    const validUsers: Array<{
      userId: number
      username: string
      notifierId: number
    }> = []

    // Get existing notifiers once
    const existingNotifiers = await this.getNotifiers()

    for (const user of interestedUsers) {
      // Check if user has a notifier ID and if it actually exists in Tautulli
      const hasValidNotifierId = user.notifierId && user.notifierId !== 0
      const notifierExists =
        hasValidNotifierId &&
        existingNotifiers.some((n) => n.id === user.notifierId)

      if (!hasValidNotifierId || !notifierExists) {
        if (hasValidNotifierId && !notifierExists) {
          this.log.warn(
            { user: user.username, invalidNotifierId: user.notifierId },
            'User has invalid Tautulli notifier ID - will create new one',
          )
          // Clear the invalid notifier ID from the database
          await this.db.updateUser(user.userId, { tautulli_notifier_id: null })
        }
        this.log.info(
          { user: user.username },
          'User has no Tautulli notifier for queueing, creating one now',
        )

        try {
          const notifierId = await this.ensureUserNotifier(
            {
              id: user.userId,
              username: user.username,
              tautulli_notifier_id: null,
            },
            existingNotifiers,
          )

          if (notifierId) {
            validUsers.push({
              ...user,
              notifierId,
            })
            this.log.info(
              { user: user.username, notifierId },
              'Created Tautulli notifier for user',
            )

            // Give Tautulli a moment to process the new agent before using it
            await new Promise((resolve) => setTimeout(resolve, 2000))
          } else {
            this.log.warn(
              { user: user.username },
              'Failed to create Tautulli notifier for user - ensureUserNotifier returned null, skipping notification',
            )
          }
        } catch (error) {
          this.log.error(
            {
              error: error instanceof Error ? error.message : error,
              user: user.username,
            },
            'Error creating Tautulli notifier for user',
          )
        }
      } else {
        validUsers.push(user)
      }
    }

    if (validUsers.length === 0) {
      this.log.warn(
        'No valid users with Tautulli notifiers after filtering, skipping notification queue',
      )
      return
    }

    // Try immediate notification first for users with newly created agents
    const immediateResults: Array<{ username: string; success: boolean }> = []
    const usersNeedingQueue: typeof validUsers = []

    for (const user of validUsers) {
      // Try to find the content immediately in Tautulli's recently added
      try {
        const recentItems = await this.getRecentlyAdded(50)
        const mockNotification: PendingNotification = {
          guid: normalizeGuid(guid),
          mediaType,
          watchlistItemId: metadata.watchlistItemId,
          watchlistItemKey: metadata.watchlistItemKey,
          interestedUsers: [user],
          title: metadata.title,
          seasonNumber: metadata.seasonNumber,
          episodeNumber: metadata.episodeNumber,
          addedAt: Date.now(),
          attempts: 1,
          maxAttempts: this.MAX_ATTEMPTS,
        }

        const matchingItem = await this.findMatchingItem(
          mockNotification,
          recentItems,
        )

        if (matchingItem) {
          this.log.debug(
            { user: user.username, title: metadata.title },
            'Found content immediately after agent creation, sending notification now',
          )

          const success = await this.sendTautulliNotification(
            user.notifierId,
            matchingItem.rating_key,
          )

          immediateResults.push({ username: user.username, success })

          if (success) {
            this.log.debug(
              { user: user.username, title: metadata.title },
              'Successfully sent immediate Tautulli notification after agent creation',
            )
            continue // Don't queue this user
          }
        }
      } catch (error) {
        this.log.debug(
          { error, user: user.username },
          'Failed immediate notification attempt, will queue instead',
        )
      }

      // If immediate notification failed or content not found, queue for polling
      usersNeedingQueue.push(user)
    }

    // If all users were handled immediately, we're done
    if (usersNeedingQueue.length === 0) {
      this.log.debug(
        {
          title: metadata.title,
          immediateSuccesses: immediateResults.filter((r) => r.success).length,
          immediateFails: immediateResults.filter((r) => !r.success).length,
        },
        'All Tautulli notifications sent immediately, no queuing needed',
      )
      return
    }

    // Queue remaining users who need polling
    const normalizedGuid = normalizeGuid(guid)
    const key = this.generateNotificationKey(normalizedGuid, metadata)

    // Check if we already have this notification queued
    const existing = this.pendingNotifications.get(key)
    if (existing) {
      // Add any new users to the existing notification
      for (const user of usersNeedingQueue) {
        if (!existing.interestedUsers.some((u) => u.userId === user.userId)) {
          existing.interestedUsers.push(user)
        }
      }
      this.log.debug(
        { key, userCount: existing.interestedUsers.length },
        'Updated existing queued notification with new users',
      )
      return
    }

    const notification: PendingNotification = {
      guid: normalizedGuid,
      mediaType,
      watchlistItemId: metadata.watchlistItemId,
      watchlistItemKey: metadata.watchlistItemKey,
      interestedUsers: usersNeedingQueue,
      title: metadata.title,
      seasonNumber: metadata.seasonNumber,
      episodeNumber: metadata.episodeNumber,
      addedAt: Date.now(),
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
    }

    this.pendingNotifications.set(key, notification)

    this.log.info(
      {
        guid: normalizedGuid,
        mediaType,
        title: metadata.title,
        users: usersNeedingQueue.map((u) => u.username),
        seasonNumber: metadata.seasonNumber,
        episodeNumber: metadata.episodeNumber,
        immediateNotifications: immediateResults.length,
      },
      'Queued Tautulli notification for remaining users',
    )

    // Start polling if not already running
    this.startPolling()
  }

  /**
   * Generate a unique key for a notification
   */
  private generateNotificationKey(
    guid: string,
    metadata: { seasonNumber?: number; episodeNumber?: number },
  ): string {
    let key = guid
    if (metadata.seasonNumber !== undefined) {
      key += `:S${metadata.seasonNumber}`
    }
    if (metadata.episodeNumber !== undefined) {
      key += `E${metadata.episodeNumber}`
    }
    return key
  }

  /**
   * Start the polling mechanism
   */
  private startPolling(): void {
    if (this.pollInterval || !this.isActive) {
      return
    }

    this.log.debug('Starting Tautulli notification polling')

    // Process immediately
    this.processPendingNotifications()

    // Then set up interval
    this.pollInterval = setInterval(() => {
      this.processPendingNotifications()
    }, this.POLL_INTERVAL_MS)
  }

  /**
   * Stop the polling mechanism
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
      this.log.debug('Stopped Tautulli notification polling')
    }
  }

  /**
   * Process all pending notifications
   */
  private async processPendingNotifications(): Promise<void> {
    if (this.isPolling) {
      this.log.debug('Polling already in progress, skipping')
      return
    }

    if (this.pendingNotifications.size === 0) {
      // Stop polling if no pending notifications
      if (this.pollInterval) {
        this.stopPolling()
      }
      return
    }

    this.isPolling = true
    const startTime = Date.now()

    try {
      // Get recently added items from Tautulli
      const recentItems = await this.getRecentlyAdded()

      if (!recentItems || recentItems.length === 0) {
        this.log.debug('No recently added items found in Tautulli')
        return
      }

      // Process each pending notification
      for (const [key, notification] of this.pendingNotifications) {
        await this.processSingleNotification(key, notification, recentItems)
      }

      // Clean up expired notifications
      this.cleanupExpiredNotifications()
    } catch (error) {
      this.log.error({ error }, 'Error processing pending notifications')
    } finally {
      const duration = Date.now() - startTime
      this.log.debug(
        {
          duration,
          pendingCount: this.pendingNotifications.size,
        },
        'Completed polling cycle',
      )
      this.isPolling = false
    }
  }

  /**
   * Get recently added items from Tautulli
   */
  private async getRecentlyAdded(count = 100): Promise<RecentlyAddedItem[]> {
    try {
      const response = await this.apiCall<{
        recently_added: RecentlyAddedItem[]
      }>('get_recently_added', {
        count,
        media_type: 'movie,show,season,episode',
      })

      return response?.response?.data?.recently_added || []
    } catch (error) {
      this.log.error(
        { error },
        'Failed to get recently added items from Tautulli',
      )
      return []
    }
  }

  /**
   * Process a single pending notification
   */
  private async processSingleNotification(
    key: string,
    notification: PendingNotification,
    recentItems: RecentlyAddedItem[],
  ): Promise<void> {
    notification.attempts++

    // Find matching item in recently added
    const matchingItem = await this.findMatchingItem(notification, recentItems)

    if (matchingItem) {
      this.log.info(
        {
          title: notification.title,
          ratingKey: matchingItem.rating_key,
          attempts: notification.attempts,
        },
        'Found matching item in Tautulli, sending notifications',
      )

      // Send notifications to all interested users
      const results = await this.sendNotificationsForItem(
        notification,
        matchingItem,
      )

      // If all notifications sent successfully, remove from queue
      if (results.every((r) => r.success)) {
        this.pendingNotifications.delete(key)
        this.log.info(
          { title: notification.title, users: results.length },
          'Successfully sent all Tautulli notifications',
        )
      } else {
        // Log failures but keep in queue for retry
        const failed = results.filter((r) => !r.success)
        this.log.warn(
          {
            title: notification.title,
            failedUsers: failed.map((r) => r.username),
          },
          'Some Tautulli notifications failed, will retry',
        )
      }
    } else if (notification.attempts >= notification.maxAttempts) {
      this.log.warn(
        {
          title: notification.title,
          guid: notification.guid,
          attempts: notification.attempts,
        },
        'Max attempts reached for Tautulli notification, removing from queue',
      )
      this.pendingNotifications.delete(key)
    } else {
      this.log.debug(
        {
          title: notification.title,
          guid: notification.guid,
          attempts: notification.attempts,
          maxAttempts: notification.maxAttempts,
        },
        'Item not yet found in Tautulli, will retry',
      )
    }
  }

  /**
   * Find a matching item in the recently added list
   */
  private async findMatchingItem(
    notification: PendingNotification,
    recentItems: RecentlyAddedItem[],
  ): Promise<RecentlyAddedItem | null> {
    // Cache to avoid repeated API calls for the same parent/grandparent metadata
    const metadataCache = new Map<string, TautulliMetadata | null>()
    const getCachedMetadata = async (
      key: string,
    ): Promise<TautulliMetadata | null> => {
      if (!key) return null
      if (metadataCache.has(key)) return metadataCache.get(key) ?? null
      const metadata = await this.getMetadata(key)
      metadataCache.set(key, metadata)
      return metadata
    }

    for (const item of recentItems) {
      // Check if media type matches
      if (!this.isMediaTypeMatch(notification.mediaType, item.media_type)) {
        continue
      }

      // Normalize GUIDs for comparison
      const itemGuids = Array.isArray(item.guids)
        ? item.guids.map((g) => normalizeGuid(g))
        : []

      // For movies, match by Plex GUID since guids array is empty
      if (notification.mediaType === 'movie' && item.guid) {
        // Extract the Plex key from the item's guid (e.g., "plex://movie/5d7768b907c4a5001e67bb61")
        const plexKey = item.guid.split('/').pop()

        // Check if this matches the watchlist item key
        if (plexKey && notification.watchlistItemKey === plexKey) {
          return item
        }
      }

      // For shows/episodes, try Plex key first (more reliable), then fall back to GUIDs
      if (
        (notification.mediaType === 'show' ||
          notification.mediaType === 'episode') &&
        item.guid &&
        notification.watchlistItemKey
      ) {
        // Extract the Plex key from the item's guid (e.g., "plex://show/5d7768b907c4a5001e67bb61")
        const plexKey = item.guid.split('/').pop()

        // Check if this matches the watchlist item key
        if (plexKey && notification.watchlistItemKey === plexKey) {
          // For episodes, also check season/episode numbers if available
          if (
            notification.mediaType === 'episode' &&
            item.media_type === 'episode'
          ) {
            const { season: itemSeason, episode: itemEpisode } =
              this.parseSeasonEpisode(item)

            if (
              itemSeason === notification.seasonNumber &&
              itemEpisode === notification.episodeNumber
            ) {
              return item
            }
          } else {
            return item
          }
        }
      }

      // Fallback: For shows/episodes, use the guids array (which is populated)
      // Direct match - check if the item's GUIDs include our notification GUID
      if (itemGuids.includes(notification.guid)) {
        // For episodes, also check season/episode numbers if available
        if (
          notification.mediaType === 'episode' &&
          item.media_type === 'episode'
        ) {
          const { season: itemSeason, episode: itemEpisode } =
            this.parseSeasonEpisode(item)

          if (
            itemSeason === notification.seasonNumber &&
            itemEpisode === notification.episodeNumber
          ) {
            return item
          }
        } else {
          return item
        }
      }

      // For show notifications that find a season, check the parent show's GUIDs or Plex key
      if (
        notification.mediaType === 'show' &&
        item.media_type === 'season' &&
        item.parent_rating_key
      ) {
        try {
          // Fetch the parent show's metadata
          const parentMetadata = await getCachedMetadata(item.parent_rating_key)

          // First try to match by Plex key (more reliable)
          if (parentMetadata?.guid && notification.watchlistItemKey) {
            const parentPlexKey = parentMetadata.guid.split('/').pop()
            if (
              parentPlexKey &&
              notification.watchlistItemKey === parentPlexKey
            ) {
              this.log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                  parentPlexKey,
                  watchlistItemKey: notification.watchlistItemKey,
                },
                'Found matching season by parent Plex key for show notification - will send season notification',
              )
              return item
            }
          }

          // Fallback to GUID matching
          if (parentMetadata?.guids) {
            const parentGuids = parentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (parentGuids.includes(notification.guid)) {
              // We found a matching season for our show
              // When multiple episodes are added, Tautulli groups them as a season
              // Send the season notification - Tautulli will show all episodes in the season
              this.log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                },
                'Found matching season by parent GUID for show notification - will send season notification',
              )
              return item
            }
          }
        } catch (error) {
          this.log.debug(
            { error, parentRatingKey: item.parent_rating_key },
            'Failed to fetch parent metadata for season matching in show notification',
          )
        }
      }

      // For episode notifications that find a season, check the parent show's GUIDs or Plex key
      if (
        notification.mediaType === 'episode' &&
        item.media_type === 'season' &&
        item.parent_rating_key
      ) {
        try {
          // Fetch the parent show's metadata
          const parentMetadata = await getCachedMetadata(item.parent_rating_key)

          // First try to match by Plex key (more reliable)
          if (parentMetadata?.guid && notification.watchlistItemKey) {
            const parentPlexKey = parentMetadata.guid.split('/').pop()
            if (
              parentPlexKey &&
              notification.watchlistItemKey === parentPlexKey
            ) {
              this.log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                  parentPlexKey,
                  watchlistItemKey: notification.watchlistItemKey,
                },
                'Found matching season by Plex key for episode notification - will send season notification',
              )
              return item
            }
          }

          // Fallback to GUID matching
          if (parentMetadata?.guids) {
            const parentGuids = parentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (parentGuids.includes(notification.guid)) {
              // We found a matching season for our show
              // When multiple episodes are added, Tautulli groups them as a season
              // Send the season notification - Tautulli will show all episodes in the season
              this.log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                },
                'Found matching season by GUID for episode notification - will send season notification',
              )
              return item
            }
          }
        } catch (error) {
          this.log.debug(
            { error, parentRatingKey: item.parent_rating_key },
            'Failed to fetch parent metadata for season matching',
          )
        }
      }

      // For episode notifications with individual episodes, check the grandparent show's GUIDs
      if (
        notification.mediaType === 'episode' &&
        item.media_type === 'episode' &&
        item.grandparent_rating_key
      ) {
        try {
          // Fetch the grandparent show's metadata
          const grandparentMetadata = await getCachedMetadata(
            item.grandparent_rating_key,
          )

          // First try to match by Plex key (more reliable)
          if (grandparentMetadata?.guid && notification.watchlistItemKey) {
            const grandparentPlexKey = grandparentMetadata.guid.split('/').pop()
            if (
              grandparentPlexKey &&
              notification.watchlistItemKey === grandparentPlexKey
            ) {
              // Check if this is the correct episode
              const { season: itemSeason, episode: itemEpisode } =
                this.parseSeasonEpisode(item)

              if (
                itemSeason === notification.seasonNumber &&
                itemEpisode === notification.episodeNumber
              ) {
                this.log.info(
                  {
                    title: notification.title,
                    episodeTitle: item.title,
                    episodeRatingKey: item.rating_key,
                    grandparentPlexKey,
                    watchlistItemKey: notification.watchlistItemKey,
                    season: item.season,
                    episode: item.episode,
                  },
                  'Found matching episode by grandparent Plex key',
                )
                return item
              }
            }
          }

          // Fallback to GUID matching
          if (grandparentMetadata?.guids) {
            const grandparentGuids = grandparentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (grandparentGuids.includes(notification.guid)) {
              // Check if this is the correct episode
              const { season: itemSeason, episode: itemEpisode } =
                this.parseSeasonEpisode(item)

              if (
                itemSeason === notification.seasonNumber &&
                itemEpisode === notification.episodeNumber
              ) {
                this.log.info(
                  {
                    title: notification.title,
                    episodeTitle: item.title,
                    episodeRatingKey: item.rating_key,
                    season: item.season,
                    episode: item.episode,
                  },
                  'Found matching episode by grandparent GUID',
                )
                return item
              }
            }
          }
        } catch (error) {
          this.log.debug(
            { error, grandparentRatingKey: item.grandparent_rating_key },
            'Failed to fetch grandparent metadata for episode matching',
          )
        }
      }
    }

    return null
  }

  /**
   * Check if media types match (accounting for different naming)
   */
  private isMediaTypeMatch(
    notificationType: 'movie' | 'show' | 'episode',
    tautulliType: 'movie' | 'show' | 'season' | 'episode',
  ): boolean {
    if (notificationType === 'movie' && tautulliType === 'movie') return true
    if (
      notificationType === 'show' &&
      (tautulliType === 'season' || tautulliType === 'show')
    )
      return true
    if (
      notificationType === 'episode' &&
      (tautulliType === 'episode' ||
        tautulliType === 'season' ||
        tautulliType === 'show')
    )
      return true
    return false
  }

  /**
   * Send notifications for a found item
   */
  private async sendNotificationsForItem(
    notification: PendingNotification,
    item: RecentlyAddedItem,
  ): Promise<Array<{ username: string; success: boolean }>> {
    const results: Array<{ username: string; success: boolean }> = []

    for (const user of notification.interestedUsers) {
      try {
        const success = await this.sendTautulliNotification(
          user.notifierId,
          item.rating_key,
        )

        results.push({ username: user.username, success })
      } catch (error) {
        this.log.error(
          { error, user: user.username, title: notification.title },
          'Error sending Tautulli notification to user',
        )
        results.push({ username: user.username, success: false })
      }
    }

    return results
  }

  /**
   * Send a Tautulli notification using the recently_added API
   */
  private async sendTautulliNotification(
    notifierId: number,
    ratingKey: string,
  ): Promise<boolean> {
    try {
      // ✅ Use Tautulli's notify_recently_added API - let Tautulli handle everything!
      const response = await this.apiCall('notify_recently_added', {
        rating_key: ratingKey,
        notifier_id: notifierId,
      })

      const isSuccess = response?.response?.result === 'success'

      if (!isSuccess) {
        this.log.warn(
          {
            notifierId,
            ratingKey,
            response: response?.response,
            message: response?.response?.message,
          },
          'Tautulli notification API call failed',
        )
      }

      return isSuccess
    } catch (error) {
      this.log.error(
        {
          error: error instanceof Error ? error.message : error,
          notifierId,
          ratingKey,
        },
        'Exception during Tautulli notification API call',
      )
      throw error
    }
  }

  /**
   * Clean up expired notifications
   */
  private cleanupExpiredNotifications(): void {
    const now = Date.now()
    let removed = 0
    const totalPending = this.pendingNotifications.size

    for (const [key, notification] of this.pendingNotifications) {
      if (now - notification.addedAt > this.MAX_AGE_MS) {
        this.pendingNotifications.delete(key)
        removed++
        this.log.warn(
          {
            title: notification.title,
            guid: notification.guid,
            ageMs: now - notification.addedAt,
            attempts: notification.attempts,
          },
          'Removed expired Tautulli notification from queue',
        )
      }
    }

    if (removed > 0) {
      this.log.info(
        {
          count: removed,
          totalPending,
          remaining: this.pendingNotifications.size,
        },
        'Cleaned up expired Tautulli notifications',
      )
    }

    // Alert if queue is growing too large
    if (this.pendingNotifications.size > 100) {
      this.log.warn(
        { queueSize: this.pendingNotifications.size },
        'Tautulli notification queue is growing large - check for processing issues',
      )
    }
  }

  /**
   * Send a media notification to a user via Tautulli
   * This method follows the same pattern as Discord and Apprise services
   * but uses the new queue-based system
   */
  async sendMediaNotification(
    user: User,
    notification: MediaNotification,
    watchlistItemId?: number,
    guid?: string,
    watchlistItemKey?: string,
  ): Promise<boolean> {
    if (!this.isActive || !watchlistItemId) {
      return false
    }

    // Check if user has Tautulli enabled
    if (!user.notify_tautulli) {
      this.log.debug(`User ${user.name} has Tautulli notifications disabled`)
      return false
    }

    // GUID should be provided by the caller
    if (!guid) {
      this.log.error(
        `No GUID provided for Tautulli notification - user: ${user.name}, title: ${notification.title}`,
      )
      return false
    }

    // Get user's Tautulli notifier ID (may be null if not yet created)
    const tautulliUser = await this.db.getUser(user.id)

    // Determine media type for Tautulli based on content type
    // For bulk releases, episodeDetails exists but episodeNumber is undefined (season-level)
    // For individual episodes, both seasonNumber and episodeNumber are defined
    let mediaType: 'movie' | 'show' | 'episode' = notification.type
    if (notification.type === 'show' && notification.episodeDetails) {
      // Only treat as individual episode if episodeNumber is explicitly provided
      mediaType =
        notification.episodeDetails.episodeNumber !== undefined
          ? 'episode'
          : 'show' // Bulk release / season-level notification
    }

    // Queue the notification - queueNotification will handle creating notifiers if needed
    await this.queueNotification(
      guid,
      mediaType,
      [
        {
          userId: user.id,
          username: user.name,
          notifierId: tautulliUser?.tautulli_notifier_id || 0,
        },
      ],
      {
        title: notification.title,
        watchlistItemId,
        watchlistItemKey, // Pass the key if provided
        seasonNumber: notification.episodeDetails?.seasonNumber,
        episodeNumber: notification.episodeDetails?.episodeNumber,
      },
    )

    // Return true since we've queued it
    return true
  }

  /**
   * Bulk notify multiple users about new content
   */
  async notifyUsersNewContent(
    users: TautulliEnabledUser[],
    mediaItem: {
      ratingKey?: string
      guid?: string
      title?: string
      type?: 'movie' | 'show' | 'episode'
    },
    _watchlistItemId: number,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isActive) {
      return { success: 0, failed: users.length }
    }

    const startTime = Date.now()
    let success = 0
    let failed = 0

    // Get existing notifiers once for efficiency
    const existingNotifiers = await this.getNotifiers()

    // Ensure all users have notifiers, creating them if needed
    const eligibleUsers: Array<
      TautulliEnabledUser & { tautulli_notifier_id: number }
    > = []

    for (const user of users) {
      if (!user.tautulli_notifier_id) {
        this.fastify.log.info(
          { user: user.username },
          'User has no Tautulli notifier, creating one now',
        )

        try {
          const notifierId = await this.ensureUserNotifier(
            user,
            existingNotifiers,
          )
          if (notifierId) {
            eligibleUsers.push({
              ...user,
              tautulli_notifier_id: notifierId,
            })
          } else {
            failed++
            this.fastify.log.warn(
              { user: user.username },
              'Failed to create Tautulli notifier for user',
            )
          }
        } catch (error) {
          failed++
          this.fastify.log.error(
            { error, user: user.username },
            'Error creating Tautulli notifier for user',
          )
        }
      } else {
        eligibleUsers.push({
          ...user,
          tautulli_notifier_id: user.tautulli_notifier_id,
        })
      }
    }

    if (eligibleUsers.length === 0) {
      return { success: 0, failed: users.length }
    }

    // Get metadata once for all users
    let metadata: TautulliMetadata | null = null

    if (mediaItem.ratingKey) {
      metadata = await this.getMetadata(mediaItem.ratingKey)
    } else if (mediaItem.guid) {
      metadata = await this.searchByGuid(mediaItem.guid)
    }

    if (!metadata) {
      this.fastify.log.warn(
        { mediaItem },
        'Could not find media in Tautulli for bulk notification',
      )

      return { success: 0, failed: users.length }
    }

    // Build notification content once
    let subject = `${metadata.title} is now available!`
    let body = `Your watchlist item "${metadata.title}" has been added to the library.`

    if (metadata.media_type === 'episode' && metadata.grandparent_title) {
      subject = `New episode of ${metadata.grandparent_title} available!`
      body = `${metadata.grandparent_title} - ${metadata.parent_title} - ${metadata.title} has been added to the library.`
    }

    if (metadata.summary) {
      body += `\n\n${metadata.summary}`
    }

    const posterUrl = metadata.thumb
      ? this.getPosterUrl(metadata.thumb, metadata.rating_key)
      : undefined

    // Store rating key since we know metadata is not null here
    const ratingKey = metadata.rating_key

    // Send notifications to each user in parallel
    const notificationPromises = eligibleUsers.map(async (user) => {
      try {
        const notification: TautulliNotificationRequest = {
          notifier_id: user.tautulli_notifier_id,
          subject,
          body,
          poster_url: posterUrl,
          rating_key: ratingKey,
        }

        const response = await this.apiCall('notify', { ...notification })
        const isSuccess = response?.response?.result === 'success'

        if (isSuccess) {
          success++
        } else {
          failed++
          this.fastify.log.warn(
            { user: user.username, error: response?.response?.message },
            'Failed to send Tautulli notification in bulk',
          )
        }
      } catch (error) {
        failed++
        this.fastify.log.error(
          { error, user: user.username },
          'Error sending Tautulli notification in bulk',
        )
      }
    })

    await Promise.all(notificationPromises)

    const duration = Date.now() - startTime
    this.fastify.log.info(
      { success, failed, title: metadata.title, duration },
      'Completed bulk Tautulli notifications',
    )

    return { success, failed }
  }

  /**
   * Get notification history for a user from the main notifications table
   */
  async getUserNotificationHistory(
    _userId: number,
    _limit = 50,
  ): Promise<
    Array<{
      id: number
      watchlist_item_id: number
      notifier_id: number | null
      success: boolean
      error_message: string | null
      notified_at: string
    }>
  > {
    // For now, return empty array since we haven't implemented
    // the notification history retrieval from the main table yet
    return []
  }

  /**
   * Check if Tautulli integration is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Get current service status
   */
  getStatus(): 'running' | 'disabled' {
    // Tautulli is running if it's initialized and enabled
    if (this.isInitialized && this.config.enabled) {
      return 'running'
    }
    return 'disabled'
  }

  /**
   * Get current configuration
   */
  getConfig(): TautulliConfig {
    return { ...this.config }
  }

  /**
   * Remove a user's notifier
   */
  async removeUserNotifier(userId: number): Promise<void> {
    // Get user with Tautulli info
    const user = await this.db.getUser(userId)

    if (!user || !user.tautulli_notifier_id) {
      return
    }

    try {
      // Remove from Tautulli
      await this.apiCall('delete_notifier', {
        notifier_id: user.tautulli_notifier_id,
      })

      // Update user record
      await this.db.updateUser(userId, { tautulli_notifier_id: null })

      this.fastify.log.info(
        { userId, notifierId: user.tautulli_notifier_id },
        'Removed user Tautulli notifier',
      )
    } catch (error) {
      this.fastify.log.error(
        { error, userId },
        'Failed to remove user notifier',
      )
    }
  }
}
