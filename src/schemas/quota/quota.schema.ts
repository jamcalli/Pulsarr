import { ContentTypeSchema } from '@root/schemas/common/content-type.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  QuotaLimitSchema,
  WatchlistCapSchema,
} from '@root/schemas/shared/quota-limits.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import { z } from 'zod'

const QuotaFieldsSchema = z.object({
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: QuotaLimitSchema.optional(),
  bypassApproval: z.boolean().optional(),
  watchlistCap: WatchlistCapSchema.nullable().optional(),
})

const EnabledQuotaSchema = QuotaFieldsSchema.extend({
  enabled: z.boolean(),
}).meta({
  id: 'UserQuotaPayload',
  description:
    'One content type quota for a user, switched on with its settings or switched off',
})

export const CreateUserQuotaSchema = z.object({
  userId: z.number(),
  quotaType: QuotaTypeSchema,
  quotaLimit: QuotaLimitSchema,
  bypassApproval: z.boolean().default(false),
  watchlistCap: WatchlistCapSchema.nullable().optional(),
})

export const UpdateUserQuotaSchema = QuotaFieldsSchema

export const UpdateSpecificQuotaSchema = QuotaFieldsSchema.extend({
  contentType: ContentTypeSchema,
})

export const UpdateSeparateQuotasSchema = z
  .object({
    movieQuota: EnabledQuotaSchema.optional(),
    showQuota: EnabledQuotaSchema.optional(),
    autoApproveHeld: z.boolean().optional(),
  })
  .meta({
    id: 'UserQuotasUpdatePayload',
    description: 'Movie and show quotas to set for one user',
  })

export const UserQuotaResponseSchema = z
  .object({
    userId: z.number(),
    contentType: ContentTypeSchema,
    quotaType: QuotaTypeSchema,
    quotaLimit: z.number(),
    bypassApproval: z.boolean(),
    watchlistCap: z.number().nullable(),
  })
  .meta({
    id: 'UserQuota',
    description: 'A user quota for one content type',
  })

export const UserQuotasResponseSchema = z
  .object({
    userId: z.number(),
    movieQuota: UserQuotaResponseSchema.optional(),
    showQuota: UserQuotaResponseSchema.optional(),
  })
  .meta({
    id: 'UserQuotas',
    description: "A user's movie and show quotas, each absent when not set",
  })

export const QuotaStatusResponseSchema = z
  .object({
    quotaType: QuotaTypeSchema,
    quotaLimit: z.number(),
    currentUsage: z.number(),
    exceeded: z.boolean(),
    resetDate: z.iso.datetime().nullable(),
    bypassApproval: z.boolean(),
    watchlistCap: z.number().nullable(),
    watchlistUsage: z.number().nullable(),
    watchlistCapExceeded: z.boolean(),
  })
  .meta({
    id: 'UserQuotaStatus',
    description: 'Current usage of a user quota against its limit and cap',
  })

export const QuotaUsageResponseSchema = z
  .object({
    userId: z.number(),
    contentType: ContentTypeSchema,
    requestDate: z.string().meta({ description: 'Date as YYYY-MM-DD' }),
  })
  .meta({
    id: 'UserQuotaUsage',
    description: 'One request counted against a user quota',
  })

export const QuotaUserIdParamsSchema = z.object({
  userId: z.coerce.number(),
})

export const GetQuotaUsageQuerySchema = z.object({
  userId: z.coerce.number(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  contentType: ContentTypeSchema.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export const GetDailyStatsQuerySchema = z.object({
  userId: z.coerce.number(),
  days: z.coerce.number().min(1).max(365).default(30),
})

export const DailyStatsResponseSchema = z
  .object({
    date: z.string(),
    movies: z.number(),
    shows: z.number(),
    total: z.number(),
  })
  .meta({
    id: 'UserQuotaDailyStats',
    description: 'Requests counted against a user quota on one day',
  })

export const GetUsersWithQuotasResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userQuotas: z.array(UserQuotaResponseSchema),
})

export const UserQuotaCreateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userQuotas: UserQuotasResponseSchema,
})

export const UserQuotaGetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userQuotas: UserQuotasResponseSchema,
})

export const UserQuotaUpdateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userQuotas: UserQuotasResponseSchema,
})

export const QuotaStatusGetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  quotaStatus: QuotaStatusResponseSchema.nullable(),
})

export const BulkQuotaStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  quotaStatuses: z.array(
    z.object({
      userId: z.number(),
      quotaStatus: QuotaStatusResponseSchema.nullable(),
    }),
  ),
})

export const QuotaUsageListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  quotaUsage: z.array(QuotaUsageResponseSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

export const DailyStatsListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  dailyStats: z.array(DailyStatsResponseSchema),
})

export const QuotaSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const PendingHeldCountResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  movieCount: z.number(),
  showCount: z.number(),
})

export const BulkQuotaOperationSchema = z
  .object({
    userIds: z.array(z.number()).min(1).max(100),
    operation: z.enum(['update', 'delete']),
    movieQuota: EnabledQuotaSchema.optional(),
    showQuota: EnabledQuotaSchema.optional(),
  })
  .meta({
    id: 'UserQuotaBulkOperationPayload',
    description: 'Quotas to set on, or delete from, several users at once',
  })

export const BulkQuotaOperationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  processedCount: z.number(),
  failedIds: z.array(z.number()).optional(),
})

export type CreateUserQuota = z.infer<typeof CreateUserQuotaSchema>
export type UpdateUserQuota = z.infer<typeof UpdateUserQuotaSchema>
export type UpdateSpecificQuota = z.infer<typeof UpdateSpecificQuotaSchema>
export type UpdateSeparateQuotas = z.infer<typeof UpdateSeparateQuotasSchema>
export type UserQuotaResponse = z.infer<typeof UserQuotaResponseSchema>
export type QuotaStatusResponse = z.infer<typeof QuotaStatusResponseSchema>
export type QuotaUsageResponse = z.infer<typeof QuotaUsageResponseSchema>
export type GetQuotaUsageQuery = z.infer<typeof GetQuotaUsageQuerySchema>
export type GetDailyStatsQuery = z.infer<typeof GetDailyStatsQuerySchema>
export type DailyStatsResponse = z.infer<typeof DailyStatsResponseSchema>
export type GetUsersWithQuotasResponse = z.infer<
  typeof GetUsersWithQuotasResponseSchema
>
export type UserQuotaCreateResponse = z.infer<
  typeof UserQuotaCreateResponseSchema
>
export type UserQuotaUpdateResponse = z.infer<
  typeof UserQuotaUpdateResponseSchema
>
export type QuotaStatusGetResponse = z.infer<
  typeof QuotaStatusGetResponseSchema
>
export type BulkQuotaStatusResponse = z.infer<
  typeof BulkQuotaStatusResponseSchema
>
export type QuotaUsageListResponse = z.infer<
  typeof QuotaUsageListResponseSchema
>
export type DailyStatsListResponse = z.infer<
  typeof DailyStatsListResponseSchema
>
export type UserQuotasResponse = z.infer<typeof UserQuotasResponseSchema>
export type QuotaError = z.infer<typeof ErrorSchema>
export type QuotaSuccessResponse = z.infer<typeof QuotaSuccessResponseSchema>
export type BulkQuotaOperation = z.infer<typeof BulkQuotaOperationSchema>
export type BulkQuotaOperationResponse = z.infer<
  typeof BulkQuotaOperationResponseSchema
>
export type PendingHeldCountResponse = z.infer<
  typeof PendingHeldCountResponseSchema
>

export { ErrorSchema as QuotaErrorSchema }
