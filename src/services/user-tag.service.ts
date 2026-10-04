import type { RadarrItem } from '@root/types/radarr.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { TagMigrationService } from './tag-migration.service.js'
import {
  radarrLibraryItems,
  sonarrLibraryItems,
} from './user-tags/arr-adapter.js'
import { cleanupOrphanedUserTags } from './user-tags/orchestration/cleanup-orphans.js'
import { createUserTags } from './user-tags/orchestration/create-tags.js'
import {
  removeAllUserTags,
  removeUserTags,
} from './user-tags/orchestration/remove-tags.js'
import {
  syncAllTags,
  syncTags,
  tagContentWithData,
} from './user-tags/orchestration/sync-tags.js'
import {
  assertPrefixChangeAllowed,
  getTagStatus,
  type TagNamingUpdate,
} from './user-tags/orchestration/tag-status.js'
import type {
  CreateResults,
  OrphanedTagCleanupResults,
  RemoveResults,
  SyncAllResults,
  TaggingResults,
  TagStatus,
  UserTagDeps,
  WatchlistGuidItem,
} from './user-tags/types.js'

export class UserTagService {
  private readonly log: FastifyBaseLogger

  private readonly migrationService: TagMigrationService

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'USER_TAG')
    this.migrationService = new TagMigrationService(baseLog, fastify)
  }

  // config is a getter because updateConfig reassigns fastify.config and deps outlive a single call
  private get deps(): UserTagDeps {
    const { fastify } = this
    return {
      logger: this.log,
      get config() {
        return fastify.config
      },
      db: fastify.db,
      fastify,
      sonarrManager: fastify.sonarrManager,
      radarrManager: fastify.radarrManager,
      migration: this.migrationService,
    }
  }

  async createSonarrUserTags(): Promise<CreateResults> {
    return createUserTags('sonarr', this.deps)
  }

  async createRadarrUserTags(): Promise<CreateResults> {
    return createUserTags('radarr', this.deps)
  }

  async tagSonarrContentWithData(
    series: SonarrItem[],
    watchlistItems: WatchlistGuidItem[],
  ): Promise<TaggingResults> {
    return tagContentWithData(
      { type: 'sonarr', items: sonarrLibraryItems(series), watchlistItems },
      this.deps,
    )
  }

  async tagRadarrContentWithData(
    movies: RadarrItem[],
    watchlistItems: WatchlistGuidItem[],
  ): Promise<TaggingResults> {
    return tagContentWithData(
      { type: 'radarr', items: radarrLibraryItems(movies), watchlistItems },
      this.deps,
    )
  }

  async syncSonarrTags(): Promise<TaggingResults> {
    return syncTags('sonarr', this.deps)
  }

  async syncRadarrTags(): Promise<TaggingResults> {
    return syncTags('radarr', this.deps)
  }

  async syncAllTags(): Promise<SyncAllResults> {
    return syncAllTags(this.deps)
  }

  async cleanupOrphanedUserTags(): Promise<OrphanedTagCleanupResults> {
    return cleanupOrphanedUserTags(this.deps)
  }

  async removeAllSonarrUserTags(
    deleteTagDefinitions = false,
  ): Promise<RemoveResults> {
    return removeUserTags({ type: 'sonarr', deleteTagDefinitions }, this.deps)
  }

  async removeAllRadarrUserTags(
    deleteTagDefinitions = false,
  ): Promise<RemoveResults> {
    return removeUserTags({ type: 'radarr', deleteTagDefinitions }, this.deps)
  }

  async removeAllUserTags(
    deleteTagDefinitions = false,
  ): Promise<{ sonarr: RemoveResults; radarr: RemoveResults }> {
    return removeAllUserTags(deleteTagDefinitions, this.deps)
  }

  async getTagStatus(): Promise<TagStatus> {
    return getTagStatus(this.deps)
  }

  /** Throws UserTagsExistError when the update changes the prefix or naming source while user tags remain. */
  async assertPrefixChangeAllowed(update: TagNamingUpdate): Promise<void> {
    return assertPrefixChangeAllowed(update, this.deps)
  }

  async cleanupOrphanedTagReferences() {
    return this.migrationService.cleanupOrphanedTagReferences()
  }
}
