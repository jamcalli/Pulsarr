import { z } from 'zod'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'

// Base enums

// User quota schemas
export const CreateUserQuotaSchema = z.object({
  userId: z.number(),
  quotaType: QuotaTypeSchema,
  quotaLimit: z.number().min(1),
  bypassApproval: z.boolean().default(false),
})

export const UpdateUserQuotaSchema = z.object({
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: z.number().min(1).optional(),
  bypassApproval: z.boolean().optional(),
})

// Schema for updating specific content type quota
export const UpdateSpecificQuotaSchema = z.object({
  contentType: z.enum(['movie', 'show']),
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: z.number().min(1).optional(),
  bypassApproval: z.boolean().optional(),
})

// Schema for updating separate movie and show quotas
export const UpdateSeparateQuotasSchema = z.object({
  movieQuota: z
    .object({
      enabled: z.boolean(),
      quotaType: QuotaTypeSchema.optional(),
      quotaLimit: z.number().min(1).optional(),
      bypassApproval: z.boolean().optional(),
    })
    .optional(),
  showQuota: z
    .object({
      enabled: z.boolean(),
      quotaType: QuotaTypeSchema.optional(),
      quotaLimit: z.number().min(1).optional(),
      bypassApproval: z.boolean().optional(),
    })
    .optional(),
})

export const UserQuotaResponseSchema = z.object({
  userId: z.number(),
  contentType: z.enum(['movie', 'show']),
  quotaType: QuotaTypeSchema,
  quotaLimit: z.number(),
  bypassApproval: z.boolean(),
})

export const UserQuotasResponseSchema = z.object({
  userId: z.number(),
  movieQuota: UserQuotaResponseSchema.optional(),
  showQuota: UserQuotaResponseSchema.optional(),
})

export const QuotaStatusResponseSchema = z.object({
  quotaType: QuotaTypeSchema,
  quotaLimit: z.number(),
  currentUsage: z.number(),
  exceeded: z.boolean(),
  resetDate: z.string().datetime().nullable(),
  bypassApproval: z.boolean(),
})

export const QuotaUsageResponseSchema = z.object({
  userId: z.number(),
  contentType: z.enum(['movie', 'show']),
  requestDate: z.string(), // YYYY-MM-DD format
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
  contentType: z.enum(['movie', 'show']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export const GetDailyStatsQuerySchema = z.object({
  userId: z.coerce.number(),
  days: z.coerce.number().min(1).max(365).default(30),
})

export const DailyStatsResponseSchema = z.object({
  date: z.string(),
  movies: z.number(),
  shows: z.number(),
  total: z.number(),
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

export const QuotaErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Bulk quota operation schemas
export const BulkQuotaOperationSchema = z.object({
  userIds: z.array(z.number()).min(1).max(100),
  operation: z.enum(['update', 'delete']),
  movieQuota: z
    .object({
      enabled: z.boolean(),
      quotaType: QuotaTypeSchema.optional(),
      quotaLimit: z.number().min(1).max(1000).optional(),
      bypassApproval: z.boolean().optional(),
    })
    .optional(),
  showQuota: z
    .object({
      enabled: z.boolean(),
      quotaType: QuotaTypeSchema.optional(),
      quotaLimit: z.number().min(1).max(1000).optional(),
      bypassApproval: z.boolean().optional(),
    })
    .optional(),
})

export const BulkQuotaOperationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  processedCount: z.number(),
  failedIds: z.array(z.number()).optional(),
})

// Type exports
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
export type QuotaError = z.infer<typeof QuotaErrorSchema>
export type BulkQuotaOperation = z.infer<typeof BulkQuotaOperationSchema>
export type BulkQuotaOperationResponse = z.infer<
  typeof BulkQuotaOperationResponseSchema
>
