import type { UpdateSeparateQuotasSchema } from '@root/schemas/quota/quota.schema'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema'
import { z } from 'zod'

// Form schema derived from backend schema to avoid drift
// Flattens the nested UpdateSeparateQuotasSchema for better UX
export const QuotaFormSchema = z
  .object({
    hasMovieQuota: z.boolean(),
    movieQuotaType: QuotaTypeSchema.optional(),
    movieQuotaLimit: z.coerce
      .number()
      .min(1, { error: 'Must be at least 1' })
      .max(1000, { error: 'Must be 1000 or less' })
      .optional(),
    movieBypassApproval: z.boolean(),

    hasShowQuota: z.boolean(),
    showQuotaType: QuotaTypeSchema.optional(),
    showQuotaLimit: z.coerce
      .number()
      .min(1, { error: 'Must be at least 1' })
      .max(1000, { error: 'Must be 1000 or less' })
      .optional(),
    showBypassApproval: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.hasMovieQuota) {
      if (!data.movieQuotaType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Movie quota type is required when movie quota is enabled',
          path: ['movieQuotaType'],
        })
      }
      if (data.movieQuotaLimit == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Movie quota limit is required when movie quota is enabled',
          path: ['movieQuotaLimit'],
        })
      } else if (data.movieQuotaLimit < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be at least 1',
          path: ['movieQuotaLimit'],
        })
      }
    }
    if (data.hasShowQuota) {
      if (!data.showQuotaType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Show quota type is required when show quota is enabled',
          path: ['showQuotaType'],
        })
      }
      if (data.showQuotaLimit == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Show quota limit is required when show quota is enabled',
          path: ['showQuotaLimit'],
        })
      } else if (data.showQuotaLimit < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be at least 1',
          path: ['showQuotaLimit'],
        })
      }
    }
  })

export interface QuotaEditStatus {
  type: 'idle' | 'loading' | 'success' | 'error'
  message?: string
}

export type QuotaFormValues = z.input<typeof QuotaFormSchema>
export type QuotaFormData = z.infer<typeof QuotaFormSchema>

/**
 * Convert flattened quota form data into the backend `UpdateSeparateQuotasSchema` shape.
 *
 * Maps the form's boolean flags and optional fields for movie and show quotas into
 * the corresponding API payload: each quota becomes `{ enabled: false }` when disabled,
 * or `{ enabled: true, quotaType, quotaLimit, bypassApproval }` when enabled.
 *
 * @param formData - Parsed form values from `QuotaFormSchema`.
 * @returns The payload conforming to `UpdateSeparateQuotasSchema` for updating separate quotas.
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
    }
  } else {
    result.showQuota = { enabled: false }
  }

  return result
}
