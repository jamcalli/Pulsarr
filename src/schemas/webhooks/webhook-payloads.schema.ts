/**
 * Webhook Payload Schemas
 *
 * Zod schemas for validating native webhook dispatch payloads.
 * These are NOT API schemas - they validate internal webhook payloads
 * before dispatch to external endpoints.
 *
 * Uses discriminated unions to ensure Radarr/Sonarr-specific fields
 * are mutually exclusive based on instanceType.
 */

import type { WebhookEventType } from '@root/types/webhook-endpoint.types.js'
import { z } from 'zod'

// =============================================================================
// Common Sub-Schemas
// =============================================================================

/** User information included in webhook payloads */
const UserInfoSchema = z.object({
  userId: z.number(),
  username: z.string(),
})

/** Basic content information */
const ContentInfoSchema = z.object({
  title: z.string(),
  type: z.enum(['movie', 'show']),
  key: z.string(),
  guids: z.array(z.string()),
})

/** Approval trigger types */
const ApprovalTriggerSchema = z.enum([
  'quota_exceeded',
  'router_rule',
  'manual_flag',
  'content_criteria',
])

// =============================================================================
// Routing Schemas (Discriminated Union)
// =============================================================================

/** Base routing fields shared by both Radarr and Sonarr */
const BaseRoutingFieldsSchema = z.object({
  instanceId: z.number(),
  qualityProfile: z.union([z.number(), z.string()]).nullable(),
  rootFolder: z.string().nullable(),
  tags: z.array(z.string()),
  searchOnAdd: z.boolean().nullable(),
  syncedInstances: z.array(z.number()).optional(),
})

/** Radarr-specific routing - includes minimumAvailability, excludes Sonarr fields */
export const RadarrRoutingPayloadSchema = BaseRoutingFieldsSchema.extend({
  instanceType: z.literal('radarr'),
  minimumAvailability: z.string().nullable(),
})

/** Sonarr-specific routing - includes seasonMonitoring/seriesType, excludes Radarr fields */
export const SonarrRoutingPayloadSchema = BaseRoutingFieldsSchema.extend({
  instanceType: z.literal('sonarr'),
  seasonMonitoring: z.string().nullable(),
  seriesType: z.enum(['standard', 'anime', 'daily']).nullable(),
})

/** Discriminated union for routing - picks schema based on instanceType */
export const RoutingPayloadSchema = z.discriminatedUnion('instanceType', [
  RadarrRoutingPayloadSchema,
  SonarrRoutingPayloadSchema,
])

/** Input type for routing builder - accepts any routing-like object */
interface RoutingInput {
  instanceType: 'radarr' | 'sonarr'
  instanceId: number
  qualityProfile?: string | number | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  minimumAvailability?: string | null
  seasonMonitoring?: string | null
  seriesType?: 'standard' | 'anime' | 'daily' | null
  syncedInstances?: number[]
}

/**
 * Builds a properly typed routing payload from a generic routing object.
 * Returns a discriminated union with only the fields relevant to the instance type.
 */
export function buildRoutingPayload(
  routing: RoutingInput,
): RadarrRoutingPayload | SonarrRoutingPayload {
  if (routing.instanceType === 'radarr') {
    return {
      instanceType: 'radarr',
      instanceId: routing.instanceId,
      qualityProfile: routing.qualityProfile ?? null,
      rootFolder: routing.rootFolder ?? null,
      tags: routing.tags ?? [],
      searchOnAdd: routing.searchOnAdd ?? null,
      minimumAvailability: routing.minimumAvailability ?? null,
      syncedInstances: routing.syncedInstances,
    }
  }
  return {
    instanceType: 'sonarr',
    instanceId: routing.instanceId,
    qualityProfile: routing.qualityProfile ?? null,
    rootFolder: routing.rootFolder ?? null,
    tags: routing.tags ?? [],
    searchOnAdd: routing.searchOnAdd ?? null,
    seasonMonitoring: routing.seasonMonitoring ?? null,
    seriesType: routing.seriesType ?? null,
    syncedInstances: routing.syncedInstances,
  }
}

/** Radarr routing for routedTo arrays (with optional rule info) */
export const RadarrRoutedToItemSchema = z.object({
  instanceId: z.number(),
  instanceType: z.literal('radarr'),
  qualityProfile: z.union([z.number(), z.string()]).optional(),
  rootFolder: z.string().optional(),
  tags: z.array(z.string()).optional(),
  searchOnAdd: z.boolean().optional(),
  ruleId: z.number().optional(),
  ruleName: z.string().optional(),
  minimumAvailability: z.string().optional(),
})

/** Sonarr routing for routedTo arrays (with optional rule info) */
export const SonarrRoutedToItemSchema = z.object({
  instanceId: z.number(),
  instanceType: z.literal('sonarr'),
  qualityProfile: z.union([z.number(), z.string()]).optional(),
  rootFolder: z.string().optional(),
  tags: z.array(z.string()).optional(),
  searchOnAdd: z.boolean().optional(),
  ruleId: z.number().optional(),
  ruleName: z.string().optional(),
  seasonMonitoring: z.string().optional(),
  seriesType: z.enum(['standard', 'anime', 'daily']).optional(),
})

/** Discriminated union for routedTo items */
export const RoutedToItemSchema = z.discriminatedUnion('instanceType', [
  RadarrRoutedToItemSchema,
  SonarrRoutedToItemSchema,
])

/** Input type for routedTo item builder */
interface RoutedToInput {
  instanceType: 'radarr' | 'sonarr'
  instanceId: number
  qualityProfile?: string | number | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  ruleId?: number
  ruleName?: string
  minimumAvailability?: string | null
  seasonMonitoring?: string | null
  seriesType?: string | null
}

/** Valid series type values */
type SeriesType = 'standard' | 'anime' | 'daily'

/**
 * Type guard for valid series type values.
 */
function isValidSeriesType(value: string): value is SeriesType {
  return value === 'standard' || value === 'anime' || value === 'daily'
}

/**
 * Normalizes seriesType to valid enum value or undefined.
 */
function normalizeSeriesType(
  value: string | null | undefined,
): SeriesType | undefined {
  if (value === null || value === undefined) return undefined
  return isValidSeriesType(value) ? value : undefined
}

/**
 * Builds a properly typed routedTo item from a generic routing detail object.
 * Returns a discriminated union with only the fields relevant to the instance type.
 */
export function buildRoutedToItem(
  detail: RoutedToInput,
):
  | z.infer<typeof RadarrRoutedToItemSchema>
  | z.infer<typeof SonarrRoutedToItemSchema> {
  if (detail.instanceType === 'radarr') {
    return {
      instanceType: 'radarr',
      instanceId: detail.instanceId,
      qualityProfile: detail.qualityProfile ?? undefined,
      rootFolder: detail.rootFolder ?? undefined,
      tags: detail.tags,
      searchOnAdd: detail.searchOnAdd ?? undefined,
      ruleId: detail.ruleId,
      ruleName: detail.ruleName,
      minimumAvailability: detail.minimumAvailability ?? undefined,
    }
  }
  return {
    instanceType: 'sonarr',
    instanceId: detail.instanceId,
    qualityProfile: detail.qualityProfile ?? undefined,
    rootFolder: detail.rootFolder ?? undefined,
    tags: detail.tags,
    searchOnAdd: detail.searchOnAdd ?? undefined,
    ruleId: detail.ruleId,
    ruleName: detail.ruleName,
    seasonMonitoring: detail.seasonMonitoring ?? undefined,
    seriesType: normalizeSeriesType(detail.seriesType),
  }
}

// =============================================================================
// Event Payload Schemas
// =============================================================================

/** media.available - Fired when content becomes available to watch */
export const MediaAvailablePayloadSchema = z.object({
  mediaType: z.enum(['movie', 'show']),
  title: z.string(),
  guids: z.array(z.string()),
  posterUrl: z.string().optional(),
  episodeDetails: z
    .object({
      seasonNumber: z.number(),
      episodeNumber: z.number().optional(),
      title: z.string().optional(),
      overview: z.string().optional(),
      airDateUtc: z.string().optional(),
    })
    .optional(),
  isBulkRelease: z.boolean(),
  instanceType: z.enum(['radarr', 'sonarr']).optional(),
  instanceId: z.number().optional(),
  watchlistedBy: z.array(
    z.object({
      userId: z.number(),
      username: z.string(),
      alias: z.string().optional(),
    }),
  ),
})

/** watchlist.added - Fired when a user adds content to their Plex watchlist */
export const WatchlistAddedPayloadSchema = z.object({
  addedBy: UserInfoSchema,
  content: z.object({
    title: z.string(),
    type: z.enum(['movie', 'show']),
    thumb: z.string().optional(),
    key: z.string(),
    guids: z.array(z.string()),
  }),
  routedTo: z.array(RoutedToItemSchema),
})

/** watchlist.removed - Fired when a user removes content from their watchlist */
export const WatchlistRemovedPayloadSchema = z.object({
  watchlistItemId: z.number(),
  content: z.object({
    title: z.string(),
    type: z.enum(['movie', 'show']),
    key: z.string(),
    guids: z.array(z.string()),
  }),
  removedBy: z.object({
    userId: z.number(),
    username: z.string(),
  }),
})

/** approval.created - Fired when a new approval request is submitted */
export const ApprovalCreatedPayloadSchema = z.object({
  approvalId: z.number(),
  content: z.object({
    title: z.string(),
    type: z.enum(['movie', 'show']),
    key: z.string(),
    posterUrl: z.string().optional(),
  }),
  requestedBy: z.object({
    userId: z.number(),
    username: z.string().nullable(),
  }),
  triggeredBy: ApprovalTriggerSchema,
  approvalReason: z.string().nullable(),
  pendingCount: z.number(),
  proposedRouting: RoutingPayloadSchema.optional(),
})

/** approval.resolved - Fired when an approval is approved or rejected */
export const ApprovalResolvedPayloadSchema = z.object({
  approvalId: z.number(),
  status: z.enum(['approved', 'rejected']),
  content: ContentInfoSchema,
  requestedBy: UserInfoSchema,
  resolvedBy: z.object({
    userId: z.number(),
  }),
  approvalNotes: z.string().optional(),
  triggeredBy: ApprovalTriggerSchema,
  createdAt: z.string(),
  resolvedAt: z.string(),
  routing: RoutingPayloadSchema.optional(),
})

/** approval.auto - Fired when content is auto-approved */
export const ApprovalAutoPayloadSchema = z.object({
  approvalId: z.number(),
  content: ContentInfoSchema,
  user: UserInfoSchema,
  routing: RoutingPayloadSchema,
  reason: z.string(),
})

/** delete_sync.completed - Fired when a delete sync job finishes */
export const DeleteSyncCompletedPayloadSchema = z.object({
  dryRun: z.boolean(),
  total: z.object({
    processed: z.number(),
    deleted: z.number(),
    skipped: z.number(),
    protected: z.number().optional(),
  }),
  movies: z.object({
    deleted: z.number(),
    skipped: z.number(),
    protected: z.number().optional(),
    items: z.array(
      z.object({
        title: z.string(),
        guid: z.string(),
        instance: z.string(),
      }),
    ),
  }),
  shows: z.object({
    deleted: z.number(),
    skipped: z.number(),
    protected: z.number().optional(),
    items: z.array(
      z.object({
        title: z.string(),
        guid: z.string(),
        instance: z.string(),
      }),
    ),
  }),
  safetyTriggered: z.boolean().optional(),
  safetyMessage: z.string().optional(),
})

/** user.created - Fired when a new user is added */
export const UserCreatedPayloadSchema = z.object({
  user: z.object({
    id: z.number(),
    name: z.string(),
    alias: z.string().nullable(),
  }),
  canSync: z.boolean(),
  requiresApproval: z.boolean(),
  createdAt: z.string(),
})

// =============================================================================
// Inferred Types
// =============================================================================

export type RadarrRoutingPayload = z.infer<typeof RadarrRoutingPayloadSchema>
export type SonarrRoutingPayload = z.infer<typeof SonarrRoutingPayloadSchema>
export type RoutingPayload = z.infer<typeof RoutingPayloadSchema>
export type RoutedToItem = z.infer<typeof RoutedToItemSchema>

export type MediaAvailablePayload = z.infer<typeof MediaAvailablePayloadSchema>
export type WatchlistAddedPayload = z.infer<typeof WatchlistAddedPayloadSchema>
export type WatchlistRemovedPayload = z.infer<
  typeof WatchlistRemovedPayloadSchema
>
export type ApprovalCreatedPayload = z.infer<
  typeof ApprovalCreatedPayloadSchema
>
export type ApprovalResolvedPayload = z.infer<
  typeof ApprovalResolvedPayloadSchema
>
export type ApprovalAutoPayload = z.infer<typeof ApprovalAutoPayloadSchema>
export type DeleteSyncCompletedPayload = z.infer<
  typeof DeleteSyncCompletedPayloadSchema
>
export type UserCreatedPayload = z.infer<typeof UserCreatedPayloadSchema>

// =============================================================================
// Payload Map (for typed dispatch)
// =============================================================================

/** Maps event types to their payload types for typed dispatch */
export type WebhookPayloadMap = {
  'media.available': MediaAvailablePayload
  'watchlist.added': WatchlistAddedPayload
  'watchlist.removed': WatchlistRemovedPayload
  'approval.created': ApprovalCreatedPayload
  'approval.resolved': ApprovalResolvedPayload
  'approval.auto': ApprovalAutoPayload
  'delete_sync.completed': DeleteSyncCompletedPayload
  'user.created': UserCreatedPayload
}

/** Mapped type preserving schema output types per event */
type WebhookPayloadSchemas = {
  [K in WebhookEventType]: z.ZodType<WebhookPayloadMap[K]>
}

/** Maps event types to their Zod schemas for runtime validation */
export const WEBHOOK_PAYLOAD_SCHEMAS: WebhookPayloadSchemas = {
  'media.available': MediaAvailablePayloadSchema,
  'watchlist.added': WatchlistAddedPayloadSchema,
  'watchlist.removed': WatchlistRemovedPayloadSchema,
  'approval.created': ApprovalCreatedPayloadSchema,
  'approval.resolved': ApprovalResolvedPayloadSchema,
  'approval.auto': ApprovalAutoPayloadSchema,
  'delete_sync.completed': DeleteSyncCompletedPayloadSchema,
  'user.created': UserCreatedPayloadSchema,
}

// =============================================================================
// Example Payloads (Type-checked)
// =============================================================================

export const MEDIA_AVAILABLE_EXAMPLE: MediaAvailablePayload = {
  mediaType: 'movie',
  title: 'Dune: Part Two',
  guids: ['imdb:tt15239678', 'tmdb:693134'],
  posterUrl: 'https://image.tmdb.org/t/p/w500/czembW0Rk1Ke7lCJGahbOhdCvlq.jpg',
  isBulkRelease: false,
  instanceType: 'radarr',
  instanceId: 1,
  watchlistedBy: [
    { userId: 1, username: 'john_doe', alias: 'John' },
    { userId: 2, username: 'jane_smith' },
  ],
}

export const WATCHLIST_ADDED_EXAMPLE: WatchlistAddedPayload = {
  addedBy: { userId: 1, username: 'john_doe' },
  content: {
    title: 'Dune: Part Two',
    type: 'movie',
    thumb: 'https://metadata-static.plex.tv/poster.jpg',
    key: '5d7768388718ba001e31563d',
    guids: ['imdb:tt15239678', 'tmdb:693134'],
  },
  routedTo: [
    {
      instanceId: 1,
      instanceType: 'radarr',
      qualityProfile: '1080p',
      rootFolder: '/movies',
      tags: ['plex-user'],
      searchOnAdd: true,
      minimumAvailability: 'released',
    },
  ],
}

export const WATCHLIST_REMOVED_EXAMPLE: WatchlistRemovedPayload = {
  watchlistItemId: 123,
  content: {
    title: 'Dune: Part Two',
    type: 'movie',
    key: '5d7768388718ba001e31563d',
    guids: ['imdb:tt15239678', 'tmdb:693134'],
  },
  removedBy: {
    userId: 1,
    username: 'john_doe',
  },
}

export const APPROVAL_CREATED_EXAMPLE: ApprovalCreatedPayload = {
  approvalId: 42,
  content: {
    title: 'The Batman',
    type: 'movie',
    key: '5d7768388718ba001e31abc',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  },
  requestedBy: {
    userId: 1,
    username: 'john_doe',
  },
  triggeredBy: 'quota_exceeded',
  approvalReason: 'User has exceeded monthly movie quota (5/5)',
  pendingCount: 3,
  proposedRouting: {
    instanceType: 'radarr',
    instanceId: 1,
    qualityProfile: '1080p',
    rootFolder: '/movies',
    tags: ['plex-user'],
    searchOnAdd: true,
    minimumAvailability: 'released',
  },
}

export const APPROVAL_RESOLVED_EXAMPLE: ApprovalResolvedPayload = {
  approvalId: 42,
  status: 'approved',
  content: {
    title: 'The Batman',
    type: 'movie',
    key: '5d7768388718ba001e31abc',
    guids: ['imdb:tt1877830', 'tmdb:414906'],
  },
  requestedBy: {
    userId: 1,
    username: 'john_doe',
  },
  resolvedBy: {
    userId: 99,
  },
  approvalNotes: 'Approved - great movie choice!',
  triggeredBy: 'quota_exceeded',
  createdAt: '2024-12-20T10:00:00.000Z',
  resolvedAt: '2024-12-20T10:30:00.000Z',
  routing: {
    instanceType: 'radarr',
    instanceId: 1,
    qualityProfile: '1080p',
    rootFolder: '/movies',
    tags: ['plex-user'],
    searchOnAdd: true,
    minimumAvailability: 'released',
  },
}

export const APPROVAL_AUTO_EXAMPLE: ApprovalAutoPayload = {
  approvalId: 43,
  content: {
    title: 'Breaking Bad',
    type: 'show',
    key: '5d7768388718ba001e31def',
    guids: ['imdb:tt0903747', 'tmdb:1396', 'tvdb:81189'],
  },
  user: {
    userId: 1,
    username: 'john_doe',
  },
  routing: {
    instanceType: 'sonarr',
    instanceId: 1,
    qualityProfile: '1080p',
    rootFolder: '/shows',
    tags: ['plex-user'],
    searchOnAdd: true,
    seasonMonitoring: 'all',
    seriesType: 'standard',
  },
  reason: 'Auto-approved (no approval required)',
}

export const DELETE_SYNC_COMPLETED_EXAMPLE: DeleteSyncCompletedPayload = {
  dryRun: false,
  total: {
    processed: 150,
    deleted: 12,
    skipped: 138,
    protected: 5,
  },
  movies: {
    deleted: 8,
    skipped: 92,
    protected: 3,
    items: [
      { title: 'Old Movie', guid: 'imdb:tt0000001', instance: 'Radarr' },
      { title: 'Another Movie', guid: 'imdb:tt0000002', instance: 'Radarr' },
    ],
  },
  shows: {
    deleted: 4,
    skipped: 46,
    protected: 2,
    items: [
      { title: 'Cancelled Show', guid: 'tvdb:12345', instance: 'Sonarr' },
    ],
  },
  safetyTriggered: false,
}

export const USER_CREATED_EXAMPLE: UserCreatedPayload = {
  user: {
    id: 42,
    name: 'new_user',
    alias: 'New User',
  },
  canSync: true,
  requiresApproval: false,
  createdAt: '2024-12-20T10:30:00.000Z',
}

// =============================================================================
// Payload Registry (for API/UI consumption)
// =============================================================================

export interface WebhookPayloadRegistryEntry {
  schema: z.ZodType
  example: unknown
  description: string
}

/** Registry mapping event types to their schema, example, and description */
export const WEBHOOK_PAYLOAD_REGISTRY: Record<
  WebhookEventType,
  WebhookPayloadRegistryEntry
> = {
  'media.available': {
    schema: MediaAvailablePayloadSchema,
    example: MEDIA_AVAILABLE_EXAMPLE,
    description: 'Fired when content becomes available to watch',
  },
  'watchlist.added': {
    schema: WatchlistAddedPayloadSchema,
    example: WATCHLIST_ADDED_EXAMPLE,
    description: 'Fired when a user adds content to their Plex watchlist',
  },
  'watchlist.removed': {
    schema: WatchlistRemovedPayloadSchema,
    example: WATCHLIST_REMOVED_EXAMPLE,
    description: 'Fired when a user removes content from their watchlist',
  },
  'approval.created': {
    schema: ApprovalCreatedPayloadSchema,
    example: APPROVAL_CREATED_EXAMPLE,
    description: 'Fired when a new approval request is submitted',
  },
  'approval.resolved': {
    schema: ApprovalResolvedPayloadSchema,
    example: APPROVAL_RESOLVED_EXAMPLE,
    description: 'Fired when an approval is approved or rejected',
  },
  'approval.auto': {
    schema: ApprovalAutoPayloadSchema,
    example: APPROVAL_AUTO_EXAMPLE,
    description: 'Fired when content is auto-approved',
  },
  'delete_sync.completed': {
    schema: DeleteSyncCompletedPayloadSchema,
    example: DELETE_SYNC_COMPLETED_EXAMPLE,
    description: 'Fired when a delete sync job finishes',
  },
  'user.created': {
    schema: UserCreatedPayloadSchema,
    example: USER_CREATED_EXAMPLE,
    description: 'Fired when a new user is added',
  },
}
