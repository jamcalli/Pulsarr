import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'
import {
  hoursToMs,
  minutesToMs,
} from '@/features/notifications/lib/delivery-units'

const { shape } = ConfigUpdateSchema

function storedAsMs(toMs: (value: number) => number, stored: z.ZodType) {
  return z.number().superRefine((value, ctx) => {
    for (const issue of stored.safeParse(toMs(value)).error?.issues ?? []) {
      ctx.addIssue({ code: 'custom', message: issue.message })
    }
  })
}

export const DeliveryFormSchema = z.object({
  queueWaitMinutes: storedAsMs(minutesToMs, shape.queueWaitTime.unwrap()),
  newEpisodeThresholdHours: storedAsMs(
    hoursToMs,
    shape.newEpisodeThreshold.unwrap(),
  ),
  notifyOnUpdate: shape.notifyOnUpdate.unwrap(),
  watchlistAddNotify: shape.watchlistAddNotify.unwrap(),
  notifyOnAvailability: shape.notifyOnAvailability.unwrap(),
})
