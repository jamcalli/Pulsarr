import type { UpdateSeparateQuotasSchema } from '@root/schemas/quota/quota.schema'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema'
import { z } from 'zod'

// Shared quota field definitions to avoid duplication between single and bulk forms
const quotaLimitField = z
  .number()
  .min(1, { error: 'Must be at least 1' })
  .max(1000, { error: 'Must be 1000 or less' })
  .optional()

const lifetimeLimitField = z
  .number()
  .min(1, { error: 'Must be at least 1' })
  .optional()

// Shared per-content-type quota fields
const contentTypeQuotaFields = {
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: quotaLimitField,
  bypassApproval: z.boolean(),
  hasLifetimeLimit: z.boolean(),
  lifetimeLimit: lifetimeLimitField,
}

// Shared validation for lifetime limits
function validateLifetimeLimit(
  hasLimit: boolean,
  limit: number | undefined,
  contentType: string,
  ctx: z.RefinementCtx,
) {
  if (!hasLimit) return
  if (limit == null) {
    ctx.addIssue({
      code: 'custom',
      message: `${contentType} lifetime limit is required when enabled`,
      path: [`${contentType.toLowerCase()}LifetimeLimit`],
    })
  } else if (limit < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be at least 1',
      path: [`${contentType.toLowerCase()}LifetimeLimit`],
    })
  }
}

function validatePeriodQuota(
  hasQuota: boolean,
  quotaType: string | undefined,
  quotaLimit: number | undefined,
  contentType: string,
  ctx: z.RefinementCtx,
) {
  if (!hasQuota) return
  if (!quotaType) {
    ctx.addIssue({
      code: 'custom',
      message: `${contentType} quota type is required when ${contentType.toLowerCase()} quota is enabled`,
      path: [`${contentType.toLowerCase()}QuotaType`],
    })
  }
  if (quotaLimit == null) {
    ctx.addIssue({
      code: 'custom',
      message: `${contentType} quota limit is required when ${contentType.toLowerCase()} quota is enabled`,
      path: [`${contentType.toLowerCase()}QuotaLimit`],
    })
  } else if (quotaLimit < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be at least 1',
      path: [`${contentType.toLowerCase()}QuotaLimit`],
    })
  }
}

// Single-user quota form schema
// Flattens the nested UpdateSeparateQuotasSchema for better form UX
export const QuotaFormSchema = z
  .object({
    hasMovieQuota: z.boolean(),
    movieQuotaType: contentTypeQuotaFields.quotaType,
    movieQuotaLimit: contentTypeQuotaFields.quotaLimit,
    movieBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasMovieLifetimeLimit: contentTypeQuotaFields.hasLifetimeLimit,
    movieLifetimeLimit: contentTypeQuotaFields.lifetimeLimit,

    hasShowQuota: z.boolean(),
    showQuotaType: contentTypeQuotaFields.quotaType,
    showQuotaLimit: contentTypeQuotaFields.quotaLimit,
    showBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasShowLifetimeLimit: contentTypeQuotaFields.hasLifetimeLimit,
    showLifetimeLimit: contentTypeQuotaFields.lifetimeLimit,
  })
  .superRefine((data, ctx) => {
    validatePeriodQuota(
      data.hasMovieQuota,
      data.movieQuotaType,
      data.movieQuotaLimit,
      'Movie',
      ctx,
    )
    validateLifetimeLimit(
      data.hasMovieLifetimeLimit,
      data.movieLifetimeLimit,
      'Movie',
      ctx,
    )
    validatePeriodQuota(
      data.hasShowQuota,
      data.showQuotaType,
      data.showQuotaLimit,
      'Show',
      ctx,
    )
    validateLifetimeLimit(
      data.hasShowLifetimeLimit,
      data.showLifetimeLimit,
      'Show',
      ctx,
    )
  })

// Bulk quota form schema
export const BulkQuotaFormSchema = z
  .object({
    clearQuotas: z.boolean(),

    setMovieQuota: z.boolean(),
    movieQuotaType: contentTypeQuotaFields.quotaType,
    movieQuotaLimit: contentTypeQuotaFields.quotaLimit,
    movieBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasMovieLifetimeLimit: contentTypeQuotaFields.hasLifetimeLimit,
    movieLifetimeLimit: contentTypeQuotaFields.lifetimeLimit,

    setShowQuota: z.boolean(),
    showQuotaType: contentTypeQuotaFields.quotaType,
    showQuotaLimit: contentTypeQuotaFields.quotaLimit,
    showBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasShowLifetimeLimit: contentTypeQuotaFields.hasLifetimeLimit,
    showLifetimeLimit: contentTypeQuotaFields.lifetimeLimit,
  })
  .refine(
    (data) => {
      if (
        data.setMovieQuota &&
        data.movieQuotaLimit !== undefined &&
        data.movieQuotaLimit < 1
      ) {
        return false
      }
      if (
        data.setShowQuota &&
        data.showQuotaLimit !== undefined &&
        data.showQuotaLimit < 1
      ) {
        return false
      }
      return true
    },
    {
      message: 'Quota limits must be at least 1 when quotas are enabled',
      path: ['movieQuotaLimit'],
    },
  )

// Shared status type for both single and bulk quota operations
export interface QuotaEditStatus {
  type: 'idle' | 'loading' | 'success' | 'error'
  message?: string
}

export type QuotaFormValues = z.input<typeof QuotaFormSchema>
export type QuotaFormData = z.infer<typeof QuotaFormSchema>
export type BulkQuotaFormValues = z.input<typeof BulkQuotaFormSchema>
export type BulkQuotaFormData = z.infer<typeof BulkQuotaFormSchema>

/**
 * Convert flattened quota form data into the backend `UpdateSeparateQuotasSchema` shape.
 */
export function transformQuotaFormToAPI(
  formData: QuotaFormData,
): z.infer<typeof UpdateSeparateQuotasSchema> {
  const result: z.infer<typeof UpdateSeparateQuotasSchema> = {}

  // Movie quota
  if (formData.hasMovieQuota) {
    result.movieQuota = {
      enabled: true,
      quotaType: formData.movieQuotaType,
      quotaLimit: formData.movieQuotaLimit,
      bypassApproval: formData.movieBypassApproval,
      lifetimeLimit: formData.hasMovieLifetimeLimit
        ? formData.movieLifetimeLimit
        : null,
    }
  } else {
    result.movieQuota = { enabled: false }
  }

  // Show quota
  if (formData.hasShowQuota) {
    result.showQuota = {
      enabled: true,
      quotaType: formData.showQuotaType,
      quotaLimit: formData.showQuotaLimit,
      bypassApproval: formData.showBypassApproval,
      lifetimeLimit: formData.hasShowLifetimeLimit
        ? formData.showLifetimeLimit
        : null,
    }
  } else {
    result.showQuota = { enabled: false }
  }

  return result
}
