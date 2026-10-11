import { z } from 'zod'

export const QuotaTypeSchema = z
  .enum(['daily', 'weekly_rolling', 'monthly'])
  .meta({
    id: 'QuotaType',
    description:
      'Quota window, a calendar day, rolling 7 days, or calendar month',
  })
export type QuotaType = z.infer<typeof QuotaTypeSchema>
