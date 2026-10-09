import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const DiagnosticPresenceSchema = z.enum([
  // On the live Plex watchlist and stored by Pulsarr
  'both',
  // On the live Plex watchlist, never stored by Pulsarr
  'plex_only',
  // Stored by Pulsarr, gone from the live Plex watchlist
  'pulsarr_only',
  // Stored by Pulsarr, but the live fetch hit the page cap before reaching it
  'not_checked',
])

export const DiagnosticStateSchema = z.enum([
  'routed',
  'not_seen_yet',
  'removed_from_plex',
  'excluded_global',
  'excluded_user',
  'unsupported_type',
  'missing_ids',
  'awaiting_approval',
  'approval_rejected',
  'approval_expired',
  'approved_not_routed',
  'sync_disabled',
  'watchlist_cap',
  'not_routed',
])

const InstanceStatusSchema = z.enum([
  'pending',
  'requested',
  'grabbed',
  'notified',
])

const DiagnosticInstanceSchema = z.object({
  arr: z.enum(['radarr', 'sonarr']),
  instanceId: z.number(),
  instanceName: z.string(),
  status: InstanceStatusSchema,
  isPrimary: z.boolean(),
  syncing: z.boolean(),
  lastNotifiedAt: z.string().nullable(),
})

const DiagnosticApprovalSchema = z.object({
  id: z.number(),
  status: z.enum([
    'pending',
    'approved',
    'rejected',
    'expired',
    'auto_approved',
  ]),
  triggeredBy: z.enum([
    'quota_exceeded',
    'router_rule',
    'manual_flag',
    'content_criteria',
  ]),
  reason: z.string().nullable(),
  ruleName: z.string().nullable(),
  createdAt: z.string(),
})

const DiagnosticExclusionSchema = z.object({
  scope: z.enum(['user', 'global']),
  excludedAt: z.string(),
})

export const DiagnosticItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  type: z.string(),
  presence: DiagnosticPresenceSchema,
  state: DiagnosticStateSchema,
  reason: z.string(),
  watchlistItemId: z.number().nullable(),
  status: InstanceStatusSchema.nullable(),
  addedAt: z.string().nullable(),
  guids: z.array(z.string()),
  ids: z.object({
    tmdb: z.number().nullable(),
    tvdb: z.number().nullable(),
    imdb: z.string().nullable(),
  }),
  instances: z.array(DiagnosticInstanceSchema),
  approval: DiagnosticApprovalSchema.nullable(),
  exclusion: DiagnosticExclusionSchema.nullable(),
  lastNotifiedAt: z.string().nullable(),
})

const QuotaSummarySchema = z.object({
  exceeded: z.boolean(),
  currentUsage: z.number(),
  quotaLimit: z.number(),
  bypassApproval: z.boolean(),
  watchlistCap: z.number().nullable(),
  watchlistUsage: z.number().nullable(),
  watchlistCapExceeded: z.boolean(),
})

export const WatchlistDiagnosticsSchema = z.object({
  user: z.object({
    id: z.number(),
    name: z.string(),
    isPrimary: z.boolean(),
    canSync: z.boolean(),
    requiresApproval: z.boolean(),
  }),
  generatedAt: z.string(),
  live: z.object({
    source: z.enum(['self', 'friend']),
    itemCount: z.number(),
    truncated: z.boolean(),
    maxItems: z.number(),
  }),
  workflow: z.object({
    status: z.string(),
    rssMode: z.boolean(),
    nextReconciliationAt: z.string().nullable(),
  }),
  quotas: z.object({
    movie: QuotaSummarySchema.nullable(),
    show: QuotaSummarySchema.nullable(),
  }),
  summary: z.object({
    onPlex: z.number(),
    inPulsarr: z.number(),
    plexOnly: z.number(),
    pulsarrOnly: z.number(),
    routed: z.number(),
    needsAttention: z.number(),
  }),
  items: z.array(DiagnosticItemSchema),
})

export const RunWatchlistDiagnosticsParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export const RunWatchlistDiagnosticsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  diagnostics: WatchlistDiagnosticsSchema,
})

export const WatchlistDiagnosticsErrorSchema = ErrorSchema

export type DiagnosticPresence = z.infer<typeof DiagnosticPresenceSchema>
export type DiagnosticState = z.infer<typeof DiagnosticStateSchema>
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>
export type DiagnosticInstance = z.infer<typeof DiagnosticInstanceSchema>
export type DiagnosticApproval = z.infer<typeof DiagnosticApprovalSchema>
export type DiagnosticExclusion = z.infer<typeof DiagnosticExclusionSchema>
export type DiagnosticQuotaSummary = z.infer<typeof QuotaSummarySchema>
export type WatchlistDiagnostics = z.infer<typeof WatchlistDiagnosticsSchema>
export type RunWatchlistDiagnosticsResponse = z.infer<
  typeof RunWatchlistDiagnosticsResponseSchema
>
