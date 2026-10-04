import type { Config, RemovedTagMode, User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { TagMigrationService } from '@services/tag-migration.service.js'
import type { NamingSource } from '@utils/tag-normalization.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export type ArrType = 'sonarr' | 'radarr'

export interface Tag {
  id: number
  label: string
}

export interface TagDetail extends Tag {
  itemIds: number[]
}

export interface ItemTagUpdate {
  itemId: number
  tagIds: number[]
}

export interface ArrLibraryItem {
  id: number
  guids: string[]
  tags: number[]
}

/** A library item from the manager-wide fetch, before it is resolved to one instance's arr id. */
export interface LibraryItem {
  instanceId: number | undefined
  title: string
  guids: string[]
  tags: number[] | undefined
  isExclusion: boolean
}

export interface WatchlistGuidItem {
  user_id: number
  guids?: string[] | string
}

export interface ArrInstanceRef {
  id: number
  name: string
}

export interface ArrAdapter {
  type: ArrType
  instanceId: number
  name: string
  getTags(): Promise<Tag[]>
  getTagDetails(): Promise<TagDetail[]>
  createTag(label: string): Promise<Tag>
  deleteTag(id: number): Promise<void>
  bulkUpdateTags(
    updates: ItemTagUpdate[],
    mode: 'add' | 'remove',
  ): Promise<void>
  getAllItems(): Promise<ArrLibraryItem[]>
  /** Returns 0 when the guids carry no arr id. */
  extractItemId(guids: string[]): number
  usersWithItems(): Promise<User[]>
}

export interface ArrSource {
  type: ArrType
  displayName: string
  itemNoun: string
  getInstances(): Promise<ArrInstanceRef[]>
  /** Undefined when the manager has the instance but no initialized service. */
  getAdapter(instance: ArrInstanceRef): ArrAdapter | undefined
  fetchLibrary(): Promise<LibraryItem[]>
  watchlistItemsForType(): Promise<WatchlistGuidItem[]>
}

export interface UserTagDeps {
  logger: FastifyBaseLogger
  config: Config
  db: DatabaseService
  fastify: FastifyInstance
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  migration: TagMigrationService
}

export interface TagSettings {
  tagPrefix: string
  tagNamingSource: NamingSource
  removedTagMode: RemovedTagMode
  removedTagPrefix: string
}

export interface TaggingResults {
  tagged: number
  skipped: number
  failed: number
}

export interface CreateResults {
  created: number
  skipped: number
  failed: number
  instances: number
}

export interface TagCleanupResults {
  removed: number
  skipped: number
  failed: number
  instances: number
}

export type OrphanedTagCleanupResults = Record<ArrType, TagCleanupResults>

export interface RemoveResults {
  itemsProcessed: number
  itemsUpdated: number
  tagsRemoved: number
  tagsDeleted: number
  failed: number
  instances: number
}

export interface SyncAllResults {
  sonarr: TaggingResults
  radarr: TaggingResults
  orphanedCleanup?: OrphanedTagCleanupResults
}

export interface TagStatusInstance {
  type: ArrType
  instanceId: number
  name: string
  /** Whether tagging is switched on for this instance type; tags can remain after it is switched off. */
  enabled: boolean
  /** False when the arr could not be read, in which case the counts are unknown and reported as 0. */
  reachable: boolean
  tagCount: number
  taggedItemCount: number
}

export interface TagStatus {
  tagsExist: boolean
  instances: TagStatusInstance[]
}

export class TagNamingBlockedError extends Error {}

export class UserTagsExistError extends TagNamingBlockedError {
  constructor() {
    super(
      'Remove existing user tags before changing the tag prefix or naming source',
    )
    this.name = 'UserTagsExistError'
  }
}

export class TagStatusUnavailableError extends TagNamingBlockedError {
  constructor(instances: string[]) {
    super(
      `Could not verify user tags on ${instances.join(', ')}; fix the connection before changing the tag prefix or naming source`,
    )
    this.name = 'TagStatusUnavailableError'
  }
}
