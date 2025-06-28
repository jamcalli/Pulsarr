import { z } from 'zod'

export const QuotaTypeSchema = z.enum(['daily', 'weekly_rolling', 'monthly'])
export type QuotaType = z.infer<typeof QuotaTypeSchema>
