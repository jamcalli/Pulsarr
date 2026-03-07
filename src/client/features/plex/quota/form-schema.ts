import type { UpdateSeparateQuotasSchema } from '@root/schemas/quota/quota.schema'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema'
import { z } from 'zod'

// Shared quota field definitions to avoid duplication between single and bulk forms
const quotaLimitField = z
  .number()
  .min(1, { error: 'Must be at least 1' })
  .max(1000, { error: 'Must be 1000 or less' })
  .optional()

const watchlistCapField = z
  .number()
  .min(1, { error: 'Must be at least 1' })
  .optional()

// Shared per-content-type quota fields
const contentTypeQuotaFields = {
  quotaType: QuotaTypeSchema.optional(),
  quotaLimit: quotaLimitField,
  bypassApproval: z.boolean(),
  hasWatchlistCap: z.boolean(),
  watchlistCap: watchlistCapField,
}

// Shared validation for watchlist caps
export function validateWatchlistCap(
  hasLimit: boolean,
  limit: number | null | undefined,
  contentType: string,
  ctx: z.RefinementCtx,
) {
  if (!hasLimit) return
  if (limit == null) {
    ctx.addIssue({
      code: 'custom',
      message: `${contentType} watchlist cap is required when enabled`,
      path: [`${contentType.toLowerCase()}WatchlistCap`],
    })
  } else if (limit < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be at least 1',
      path: [`${contentType.toLowerCase()}WatchlistCap`],
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
    hasMovieWatchlistCap: contentTypeQuotaFields.hasWatchlistCap,
    movieWatchlistCap: contentTypeQuotaFields.watchlistCap,

    hasShowQuota: z.boolean(),
    showQuotaType: contentTypeQuotaFields.quotaType,
    showQuotaLimit: contentTypeQuotaFields.quotaLimit,
    showBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasShowWatchlistCap: contentTypeQuotaFields.hasWatchlistCap,
    showWatchlistCap: contentTypeQuotaFields.watchlistCap,
  })
  .superRefine((data, ctx) => {
    validatePeriodQuota(
      data.hasMovieQuota,
      data.movieQuotaType,
      data.movieQuotaLimit,
      'Movie',
      ctx,
    )
    validateWatchlistCap(
      data.hasMovieWatchlistCap,
      data.movieWatchlistCap,
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
    validateWatchlistCap(
      data.hasShowWatchlistCap,
      data.showWatchlistCap,
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
    hasMovieWatchlistCap: contentTypeQuotaFields.hasWatchlistCap,
    movieWatchlistCap: contentTypeQuotaFields.watchlistCap,

    setShowQuota: z.boolean(),
    showQuotaType: contentTypeQuotaFields.quotaType,
    showQuotaLimit: contentTypeQuotaFields.quotaLimit,
    showBypassApproval: contentTypeQuotaFields.bypassApproval,
    hasShowWatchlistCap: contentTypeQuotaFields.hasWatchlistCap,
    showWatchlistCap: contentTypeQuotaFields.watchlistCap,
  })
  .superRefine((data, ctx) => {
    validatePeriodQuota(
      data.setMovieQuota,
      data.movieQuotaType,
      data.movieQuotaLimit,
      'Movie',
      ctx,
    )
    validateWatchlistCap(
      data.setMovieQuota && data.hasMovieWatchlistCap,
      data.movieWatchlistCap,
      'Movie',
      ctx,
    )
    validatePeriodQuota(
      data.setShowQuota,
      data.showQuotaType,
      data.showQuotaLimit,
      'Show',
      ctx,
    )
    validateWatchlistCap(
      data.setShowQuota && data.hasShowWatchlistCap,
      data.showWatchlistCap,
      'Show',
      ctx,
    )
  })

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
  const result: z.infer<typeof UpdateSeparateQuotasSchema> = {
    autoApproveHeld: false,
  }

  // Movie quota
  if (formData.hasMovieQuota) {
    result.movieQuota = {
      enabled: true,
      quotaType: formData.movieQuotaType,
      quotaLimit: formData.movieQuotaLimit,
      bypassApproval: formData.movieBypassApproval,
      watchlistCap: formData.hasMovieWatchlistCap
        ? formData.movieWatchlistCap
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
      watchlistCap: formData.hasShowWatchlistCap
        ? formData.showWatchlistCap
        : null,
    }
  } else {
    result.showQuota = { enabled: false }
  }

  return result
}
