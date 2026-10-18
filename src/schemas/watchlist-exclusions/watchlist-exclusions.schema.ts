import { ContentTypeSchema } from '@root/schemas/common/content-type.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { SortOrderSchema } from '@root/schemas/common/sort-order.schema.js'
import { WatchlistStatusSchema } from '@root/schemas/common/watchlist-status.schema.js'
import { z } from 'zod'

export const WATCHLIST_EXCLUSION_ITEMS_LIMIT = { min: 1, max: 1000 } as const

export const WATCHLIST_EXCLUSION_ITEMS_DEFAULTS = {
  limit: 20,
  offset: 0,
  sortBy: 'excludedAt',
  sortOrder: 'desc',
} as const

const WatchlistExclusionSchema = z
  .object({
    id: z.number(),
    user_id: z.number(),
    key: z.string(),
    title: z.string(),
    type: z.string(),
    guids: z.array(z.string()),
    excluded_at: z.string(),
  })
  .meta({
    id: 'WatchlistExclusion',
    description: 'A watchlist exclusion row. user_id 0 is the global exclusion',
  })

const WatchlistExclusionWithUserSchema = WatchlistExclusionSchema.extend({
  username: z.string(),
}).meta({
  id: 'WatchlistExclusionWithUser',
  description: 'A watchlist exclusion row with the owning user name',
})

// Create Watchlist Exclusion Schema
export const CreateWatchlistExclusionSchema = z
  .object({
    key: z.string().trim().min(1, { error: 'Key is required' }),
    userIds: z
      .array(z.number())
      .min(1, { error: 'At least one user ID is required' }),
    title: z.string().trim().min(1, { error: 'Title is required' }),
    type: ContentTypeSchema,
    guids: z.array(z.string()).default([]),
  })
  .meta({
    id: 'WatchlistExclusionCreatePayload',
    description:
      'A watchlist item key to exclude for the given users. userIds is ignored under global scope',
  })

export const CreateWatchlistExclusionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  created: z.number(),
})

// Get All Watchlist Exclusions Schema
export const GetWatchlistExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(WatchlistExclusionWithUserSchema),
})

// Get User Watchlist Exclusions Schema
export const GetUserWatchlistExclusionsParamsSchema = z.object({
  userId: z.coerce.number(),
})

export const GetUserWatchlistExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(WatchlistExclusionSchema),
})

// Remove Watchlist Exclusion Schema
export const RemoveWatchlistExclusionParamsSchema = z.object({
  id: z.coerce.number(),
})

export const WatchlistExclusionFilterSchema = z
  .enum(['excluded', 'not-excluded', 'orphan'])
  .meta({
    id: 'WatchlistExclusionFilter',
    description:
      'excluded has a global or at least one own exclusion, not-excluded has neither, orphan has no watchlister left',
  })

export const WatchlistExclusionItemsQuerySchema = z.object({
  search: z.string().optional(),
  userId: z.coerce.number().optional(),
  type: ContentTypeSchema.optional(),
  status: WatchlistStatusSchema.optional(),
  exclusion: WatchlistExclusionFilterSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(WATCHLIST_EXCLUSION_ITEMS_LIMIT.min)
    .max(WATCHLIST_EXCLUSION_ITEMS_LIMIT.max)
    .default(WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.limit),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.offset),
  sortBy: z
    .enum(['title', 'watchlisters', 'excluded', 'excludedAt'])
    .default(WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.sortBy),
  sortOrder: SortOrderSchema.default(
    WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.sortOrder,
  ),
})

const WatchlistExclusionRefSchema = z
  .object({
    id: z.number(),
    excludedAt: z.string(),
  })
  .meta({
    id: 'WatchlistExclusionRef',
    description: 'The id and time of an exclusion row',
  })

const WatchlistExclusionUserSchema = z
  .object({
    userId: z.number(),
    userName: z.string(),
    status: WatchlistStatusSchema.nullable(),
    added: z.string().nullable(),
    ownExclusion: WatchlistExclusionRefSchema.nullable(),
  })
  .meta({
    id: 'WatchlistExclusionUser',
    description:
      'A user on a watchlist exclusion row. status is null for an own exclusion whose watchlist item is gone',
  })

export const WatchlistExclusionItemSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    type: ContentTypeSchema,
    guids: z.array(z.string()),
    thumb: z.string().nullable(),
    globalExclusion: WatchlistExclusionRefSchema.nullable(),
    watchlisterCount: z.number(),
    excludedCount: z.number(),
    users: z.array(WatchlistExclusionUserSchema),
  })
  .meta({
    id: 'WatchlistExclusionItem',
    description:
      'One title with its watchlisters and own exclusions sorted by user name. users is empty for a global exclusion no one has watchlisted',
  })

export const WatchlistExclusionItemsResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    items: z.array(WatchlistExclusionItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .meta({
    id: 'WatchlistExclusionItemsResponse',
    description: 'One page of watchlist items with their exclusion state',
  })

export const WatchlistExclusionScopeSchema = z.enum(['users', 'global']).meta({
  id: 'WatchlistExclusionScope',
  description:
    'users excludes each item for its userIds, global excludes it for every user and ignores userIds',
})

export const WatchlistExclusionBulkCreateSchema = z
  .object({
    items: z
      .array(CreateWatchlistExclusionSchema)
      .min(1, { error: 'At least one item is required' }),
    scope: WatchlistExclusionScopeSchema,
  })
  .meta({
    id: 'WatchlistExclusionBulkCreatePayload',
    description: 'Watchlist items to exclude in one request',
  })

export const WatchlistExclusionBulkCreateResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    result: z.object({
      created: z.number(),
      skipped: z.number(),
      failed: z.array(z.string()),
      errors: z.array(z.string()),
      total: z.number(),
    }),
  })
  .meta({
    id: 'WatchlistExclusionBulkCreateResponse',
    description:
      'created and skipped count exclusion rows (skipped already existed), failed lists item keys',
  })

export const WatchlistExclusionBulkRemoveSchema = z
  .object({
    ids: z
      .array(z.number())
      .min(1, { error: 'At least one exclusion ID is required' }),
  })
  .meta({
    id: 'WatchlistExclusionBulkRemovePayload',
    description: 'Exclusion ids to remove in one request',
  })

export const WatchlistExclusionBulkRemoveResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    result: z.object({
      removed: z.number(),
      failed: z.array(z.number()),
      errors: z.array(z.string()),
      total: z.number(),
    }),
  })
  .meta({
    id: 'WatchlistExclusionBulkRemoveResponse',
    description:
      'removed counts deleted rows, failed lists ids that were not found',
  })

// Exported inferred types
export type CreateWatchlistExclusion = z.infer<
  typeof CreateWatchlistExclusionSchema
>
export type CreateWatchlistExclusionResponse = z.infer<
  typeof CreateWatchlistExclusionResponseSchema
>
export type GetWatchlistExclusionsResponse = z.infer<
  typeof GetWatchlistExclusionsResponseSchema
>
export type GetUserWatchlistExclusionsParams = z.infer<
  typeof GetUserWatchlistExclusionsParamsSchema
>
export type GetUserWatchlistExclusionsResponse = z.infer<
  typeof GetUserWatchlistExclusionsResponseSchema
>
export type RemoveWatchlistExclusionParams = z.infer<
  typeof RemoveWatchlistExclusionParamsSchema
>

export type WatchlistExclusionItemsQuery = z.infer<
  typeof WatchlistExclusionItemsQuerySchema
>
export type WatchlistExclusionItemsFilter = Pick<
  WatchlistExclusionItemsQuery,
  'search' | 'userId' | 'type' | 'status' | 'exclusion'
>
export type WatchlistExclusionItem = z.infer<
  typeof WatchlistExclusionItemSchema
>
export type WatchlistExclusionUser = z.infer<
  typeof WatchlistExclusionUserSchema
>
export type WatchlistExclusionScope = z.infer<
  typeof WatchlistExclusionScopeSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as WatchlistExclusionErrorSchema }
export type WatchlistExclusionError = z.infer<typeof ErrorSchema>
