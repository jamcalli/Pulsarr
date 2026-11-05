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

export const QuotaUserIdParamsSchema = z.object({
  userId: z.coerce.number(),
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
  .refine(
    ({ movieQuota, showQuota }) =>
      [movieQuota, showQuota].every(
        (quota) =>
          !quota?.enabled ||
          (quota.quotaType !== undefined && quota.quotaLimit !== undefined),
      ),
    { error: 'An enabled quota needs a quota type and limit' },
  )
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

export type UpdateSeparateQuotas = z.infer<typeof UpdateSeparateQuotasSchema>
export type UserQuotaResponse = z.infer<typeof UserQuotaResponseSchema>
export type QuotaStatusResponse = z.infer<typeof QuotaStatusResponseSchema>
export type UserQuotaUpdateResponse = z.infer<
  typeof UserQuotaUpdateResponseSchema
>
export type QuotaStatusGetResponse = z.infer<
  typeof QuotaStatusGetResponseSchema
>
export type BulkQuotaStatusResponse = z.infer<
  typeof BulkQuotaStatusResponseSchema
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
