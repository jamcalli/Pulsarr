import type { PendingLabelSyncConfig } from '@root/types/pending-label-sync-processor.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { pluralize } from '@utils/pluralize.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class PendingLabelSyncProcessorService {
  private readonly _config: PendingLabelSyncConfig
  private _processingSyncs = false
  private _cleaningUp = false
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PENDING_LABEL_SYNC')
    this._config = {
      retryInterval: 30,
      maxAge: 10,
      cleanupInterval: 60,
    }
  }

  get config(): PendingLabelSyncConfig {
    return this._config
  }

  private get db() {
    return this.fastify.db
  }

  private get plexLabelSyncService() {
    return this.fastify.plexLabelSyncService
  }

  /** Returns how many items got labels, 0 when a run is already in progress or fails. */
  async processPendingLabelSyncs(): Promise<number> {
    if (this._processingSyncs) {
      this.log.debug(
        'Label sync processing already in progress, skipping this cycle',
      )
      return 0
    }

    this._processingSyncs = true

    try {
      const result = await this.plexLabelSyncService.processPendingLabelSyncs()

      if (result.updated > 0) {
        this.log.info(
          `Labeled ${result.updated} pending ${pluralize(result.updated, 'item')}`,
        )
        this.log.debug(
          {
            processed: result.processed,
            updated: result.updated,
            failed: result.failed,
            pending: result.pending,
          },
          'Pending label sync counts',
        )
      }

      return result.updated
    } catch (error) {
      this.log.error({ error }, 'Error processing pending label syncs:')
      return 0
    } finally {
      this._processingSyncs = false
    }
  }

  /** Returns how many expired syncs were deleted, 0 when a cleanup is already in progress or fails. */
  async cleanupExpired(): Promise<number> {
    if (this._cleaningUp) {
      this.log.debug('Cleanup already in progress, skipping this cycle')
      return 0
    }

    this._cleaningUp = true

    try {
      const deleted = await this.db.expirePendingLabelSyncs()
      return deleted
    } catch (error) {
      this.log.error({ error }, 'Error cleaning up expired label syncs:')
      return 0
    } finally {
      this._cleaningUp = false
    }
  }
}
