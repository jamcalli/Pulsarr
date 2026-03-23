import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import { z } from 'zod'

const QuotaFieldsSchema = z.object({
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: z.number().min(1).optional(),
  bypassApproval: z.boolean().optional(),
  watchlistCap: z.number().min(1).nullable().optional(),
})

const EnabledQuotaSchema = QuotaFieldsSchema.extend({
  enabled: z.boolean(),
})

const EnabledQuotaCappedSchema = EnabledQuotaSchema.extend({
  quotaLimit: z.number().min(1).max(1000).optional(),
})
export const CreateUserQuotaSchema = z.object({
  userId: z.number(),
  quotaType: QuotaTypeSchema,
  quotaLimit: z.number().min(1),
  bypassApproval: z.boolean().default(false),
  watchlistCap: z.number().min(1).nullable().optional(),
})

export const UpdateUserQuotaSchema = QuotaFieldsSchema
export const UpdateSpecificQuotaSchema = QuotaFieldsSchema.extend({
  contentType: z.enum(['movie', 'show']),
})
export const UpdateSeparateQuotasSchema = z.object({
  movieQuota: EnabledQuotaSchema.optional(),
  showQuota: EnabledQuotaSchema.optional(),
  autoApproveHeld: z.boolean().optional().default(false),
})

export const UserQuotaResponseSchema = z.object({
  userId: z.number(),
  contentType: z.enum(['movie', 'show']),
  quotaType: QuotaTypeSchema,
  quotaLimit: z.number(),
  bypassApproval: z.boolean(),
  watchlistCap: z.number().nullable(),
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
  resetDate: z.iso.datetime().nullable(),
  bypassApproval: z.boolean(),
  watchlistCap: z.number().nullable(),
  watchlistUsage: z.number().nullable(),
  watchlistCapExceeded: z.boolean(),
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
export const BulkQuotaOperationSchema = z.object({
  userIds: z.array(z.number()).min(1).max(100),
  operation: z.enum(['update', 'delete']),
  movieQuota: EnabledQuotaCappedSchema.optional(),
  showQuota: EnabledQuotaCappedSchema.optional(),
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
