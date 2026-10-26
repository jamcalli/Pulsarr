import { z } from 'zod'

export const QuotaTypeSchema = z
  .enum(['daily', 'weekly_rolling', 'monthly'])
  .meta({
    id: 'QuotaType',
    description:
      'Quota window, the current day, a rolling run of days, or a monthly period from the configured reset day',
  })
export type QuotaType = z.infer<typeof QuotaTypeSchema>
