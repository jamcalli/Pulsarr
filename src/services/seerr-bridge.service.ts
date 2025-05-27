import type { FastifyInstance } from 'fastify'
import { EventEmitter } from 'node:events'
import type {
  SeerrBridgeConfig,
  SeerrBridgeWebhookPayload,
  SeerrBridgeWebhookResponse,
  SeerrBridgeCompletionPayload,
  SeerrBridgeRequest,
  SeerrBridgeResponse,
} from '@root/types/seerr-bridge.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'

export class SeerrBridgeService {
  private config: SeerrBridgeConfig = {
    enabled: false,
    baseUrl: '',
    webhookUrl: '',
  }
  private requestTracker: Map<string, SeerrBridgeRequest> = new Map()
  private eventEmitter: EventEmitter

  constructor(private fastify: FastifyInstance) {
    this.eventEmitter = new EventEmitter()
    this.initializeConfig()

    // Cleanup old requests periodically
    setInterval(() => this.cleanupOldRequests(), 300000) // 5 minutes
  }

  private async initializeConfig(): Promise<void> {
    // Use fastify.config values which come from env.ts plugin
    this.config = {
      enabled: this.fastify.config.seerrBridgeEnabled,
      baseUrl: this.fastify.config.seerrBridgeBaseUrl,
      webhookUrl: this.fastify.config.seerrBridgeWebhookUrl,
      apiKey: this.fastify.config.seerrBridgeApiKey,
      timeoutMs: this.fastify.config.seerrBridgeTimeoutMs,
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled && !!this.config.webhookUrl
  }

  public async testConnection(): Promise<{
    success: boolean
    message: string
    error?: string
  }> {
    if (!this.isEnabled()) {
      return {
        success: false,
        message: 'SeerrBridge is not enabled',
      }
    }

    try {
      // Create test notification payload
      const testPayload: SeerrBridgeWebhookPayload = {
        notification_type: 'test',
        event: 'test',
        subject: 'Test notification',
        media: {
          media_type: 'movie',
          tmdbId: 0,
          status: '3',
        },
        request: {
          request_id: `test_${Date.now()}`,
        },
        metadata: {
          userId: 0,
          userName: 'Test User',
          title: 'Test Notification',
        },
      }

      // Send test webhook
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000), // 10 second timeout for test
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `SeerrBridge test failed: ${response.status} - ${errorText}`,
        )
      }

      // Parse and validate response
      const responseBody = (await response.json()) as SeerrBridgeWebhookResponse

      if (!responseBody || responseBody.status !== 'success') {
        throw new Error(
          `Invalid SeerrBridge test response: ${JSON.stringify(responseBody)}`,
        )
      }

      return {
        success: true,
        message:
          responseBody.message || 'Test notification processed successfully',
      }
    } catch (error) {
      let errorMessage = 'Unknown error'

      if (error instanceof Error) {
        errorMessage = error.message

        if (error.name === 'AbortError' || errorMessage.includes('timeout')) {
          errorMessage =
            'Connection timed out - SeerrBridge may not be responding'
        } else if (
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('fetch failed')
        ) {
          errorMessage = `Cannot connect to SeerrBridge at ${this.config.webhookUrl} - service is not running`
        }
      }

      this.fastify.log.error({
        msg: 'SeerrBridge test connection failed',
        error: errorMessage,
        webhookUrl: this.config.webhookUrl,
      })

      return {
        success: false,
        message: 'SeerrBridge test failed',
        error: errorMessage,
      }
    }
  }

  public async sendRequest(
    item: DatabaseWatchlistItem,
    userId: number,
    userName: string,
  ): Promise<SeerrBridgeResponse> {
    if (!this.isEnabled()) {
      return {
        success: false,
        message: 'SeerrBridge is not enabled',
      }
    }

    try {
      // Parse the tmdb ID from guids
      const guids =
        typeof item.guids === 'string'
          ? JSON.parse(item.guids)
          : item.guids || []

      this.fastify.log.debug({
        msg: 'Parsing TMDB ID from guids',
        title: item.title,
        guids: guids,
      })

      const tmdbGuid = guids.find((guid: string) => guid.startsWith('tmdb:'))

      if (!tmdbGuid) {
        this.fastify.log.error({
          msg: 'No TMDB ID found in guids',
          title: item.title,
          guids: guids,
        })
        throw new Error('No TMDB ID found for item')
      }

      const tmdbId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
      const mediaType = item.type === 'movie' ? 'movie' : 'tv'

      this.fastify.log.info({
        msg: 'Extracted TMDB ID',
        title: item.title,
        tmdbId: tmdbId,
        mediaType: mediaType,
      })

      // Check if we've already sent this item to SeerrBridge
      const existingRequest = await this.checkExistingRequest(
        tmdbId,
        mediaType,
        userId,
      )

      if (existingRequest) {
        this.fastify.log.info({
          msg: 'Item already sent to SeerrBridge',
          title: item.title,
          tmdbId,
          existingRequestId: existingRequest.id,
          status: existingRequest.status,
        })

        // Return success if the request is still pending or processing
        if (['pending', 'processing'].includes(existingRequest.status)) {
          return {
            success: true,
            message: `${item.type} request already in SeerrBridge queue`,
            requestId: existingRequest.id,
          }
        }

        // If it failed before, we could retry, but for now just return the existing state
        if (existingRequest.status === 'failed') {
          return {
            success: false,
            message: `Previous ${item.type} request to SeerrBridge failed`,
            error: existingRequest.error || 'Unknown error',
          }
        }

        // If completed, return success
        return {
          success: true,
          message: `${item.type} already processed by SeerrBridge`,
          requestId: existingRequest.id,
        }
      }

      // Generate unique request ID
      const requestId = `pulsarr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

      // Prepare webhook payload
      const payload: SeerrBridgeWebhookPayload = {
        notification_type: 'media.requested',
        event: 'media.requested',
        subject: `${item.type === 'movie' ? 'Movie' : 'TV Show'} requested`,
        media: {
          media_type: item.type === 'movie' ? 'movie' : 'tv',
          tmdbId: tmdbId,
          status: '3', // Requested status
        },
        request: {
          request_id: requestId,
        },
        metadata: {
          userId,
          userName,
          title: item.title,
        },
      }

      // Track the request
      const request: SeerrBridgeRequest = {
        id: requestId,
        requestId,
        userId,
        userName,
        tmdbId,
        mediaType: item.type === 'movie' ? 'movie' : 'tv',
        title: item.title,
        requestedAt: new Date(),
        status: 'pending',
      }

      this.requestTracker.set(requestId, request)
      await this.saveRequestToDb(request)

      // Send webhook to SeerrBridge
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs || 30000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `SeerrBridge webhook failed: ${response.status} - ${errorText}`,
        )
      }

      // Parse and validate response body
      const responseBody = (await response.json()) as SeerrBridgeWebhookResponse

      // Validate response structure
      if (!responseBody || responseBody.status !== 'success') {
        throw new Error(
          `Invalid SeerrBridge response: ${JSON.stringify(responseBody)}`,
        )
      }

      // Validate required fields based on request type (not for test notifications)
      const isTestNotification =
        payload.media?.tmdbId === 0 &&
        payload.metadata?.title === 'Test Notification'
      if (!isTestNotification) {
        if (!responseBody.message || !responseBody.media) {
          throw new Error(
            `SeerrBridge response missing required fields: ${JSON.stringify(responseBody)}`,
          )
        }

        // Log the actual response from SeerrBridge
        this.fastify.log.info({
          msg: 'SeerrBridge response received',
          requestId,
          response: responseBody,
        })
      }

      // Update request status
      request.status = 'processing'
      await this.updateRequestInDb(request)

      this.fastify.log.info({
        msg: 'SeerrBridge request sent successfully',
        requestId,
        title: item.title,
        userId,
        userName,
      })

      return {
        success: true,
        message: `Added ${item.type} request to SeerrBridge queue`,
        requestId,
      }
    } catch (error) {
      // Handle different types of errors
      let errorMessage = 'Unknown error'
      let errorType = 'unknown'

      if (error instanceof Error) {
        errorMessage = error.message

        // Check for specific error types
        if (error.name === 'AbortError' || errorMessage.includes('timeout')) {
          errorType = 'timeout'
          errorMessage = `SeerrBridge request timed out after ${this.config.timeoutMs || 30000}ms`
        } else if (
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('fetch failed')
        ) {
          errorType = 'connection'
          errorMessage = `Cannot connect to SeerrBridge at ${this.config.webhookUrl} - service may not be running`
        } else if (errorMessage.includes('Invalid SeerrBridge response')) {
          errorType = 'invalid_response'
        } else if (errorMessage.includes('SeerrBridge webhook failed')) {
          errorType = 'webhook_error'
        }
      }

      this.fastify.log.error({
        msg: 'Failed to send SeerrBridge request',
        error: errorMessage,
        errorType,
        item,
        webhookUrl: this.config.webhookUrl,
      })

      return {
        success: false,
        message: `Failed to send request to SeerrBridge: ${errorMessage}`,
        error: errorMessage,
      }
    }
  }

  public async handleCompletion(
    payload: SeerrBridgeCompletionPayload,
  ): Promise<void> {
    const requestId = payload.id.toString()
    const request =
      this.requestTracker.get(requestId) ||
      (await this.getRequestFromDb(requestId))

    if (!request) {
      this.fastify.log.warn({
        msg: 'Received completion for unknown request',
        requestId,
        tmdbId: payload.media.tmdbId,
      })
      return
    }

    // Update request status
    request.status = payload.status === 'available' ? 'completed' : 'failed'
    request.completedAt = new Date()
    request.error = payload.error

    await this.updateRequestInDb(request)
    this.requestTracker.delete(requestId)

    // Emit event for notifications
    if (payload.status === 'available') {
      this.eventEmitter.emit('seerr-bridge:media-available', {
        request,
        payload,
      })

      this.fastify.log.info({
        msg: 'SeerrBridge media available',
        requestId,
        title: request.title,
        userId: request.userId,
        userName: request.userName,
      })
    } else {
      this.fastify.log.error({
        msg: 'SeerrBridge request failed',
        requestId,
        title: request.title,
        error: payload.error,
      })
    }
  }

  public onMediaAvailable(
    listener: (data: {
      request: SeerrBridgeRequest
      payload: SeerrBridgeCompletionPayload
    }) => void,
  ): void {
    this.eventEmitter.on('seerr-bridge:media-available', listener)
  }

  private async checkExistingRequest(
    tmdbId: number,
    mediaType: string,
    userId: number,
  ): Promise<{ id: string; status: string; error?: string } | null> {
    const existingRequest =
      await this.fastify.db.getSeerrBridgeRequestByContent(
        tmdbId,
        mediaType,
        userId,
      )

    return existingRequest
  }

  private async saveRequestToDb(request: SeerrBridgeRequest): Promise<void> {
    await this.fastify.db.saveSeerrBridgeRequest({
      id: request.id,
      request_id: request.requestId,
      user_id: request.userId,
      user_name: request.userName,
      tmdb_id: request.tmdbId,
      media_type: request.mediaType,
      title: request.title,
      year: request.year,
      requested_at: request.requestedAt.toISOString(),
      status: request.status,
    })
  }

  private async updateRequestInDb(request: SeerrBridgeRequest): Promise<void> {
    await this.fastify.db.updateSeerrBridgeRequest(request.id, {
      status: request.status,
      completed_at: request.completedAt?.toISOString() || null,
      error: request.error || null,
    })
  }

  private async getRequestFromDb(
    requestId: string,
  ): Promise<SeerrBridgeRequest | null> {
    const row = await this.fastify.db.getSeerrBridgeRequest(requestId)

    if (!row) return null

    return {
      id: row.id,
      requestId: row.request_id,
      userId: row.user_id,
      userName: row.user_name,
      tmdbId: row.tmdb_id,
      mediaType: row.media_type as 'movie' | 'tv',
      title: row.title,
      year: row.year,
      requestedAt: new Date(row.requested_at),
      status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
    }
  }

  private async cleanupOldRequests(): Promise<void> {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours

    await this.fastify.db.cleanupOldSeerrBridgeRequests(
      cutoffDate.toISOString(),
    )

    // Clean up in-memory tracker
    for (const [id, request] of this.requestTracker.entries()) {
      if (
        request.requestedAt < cutoffDate &&
        ['completed', 'failed'].includes(request.status)
      ) {
        this.requestTracker.delete(id)
      }
    }
  }
}
