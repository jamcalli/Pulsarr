import { DeliveryFormSchema } from '@/features/notifications/lib/delivery-form.schema'
import {
  hoursToMs,
  minutesToMs,
  msToHours,
  msToMinutes,
} from '@/features/notifications/lib/delivery-units'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface DeliveryValues {
  queueWaitMinutes: number
  newEpisodeThresholdHours: number
  notifyOnUpdate: Config['notifyOnUpdate']
  watchlistAddNotify: Config['watchlistAddNotify']
  notifyOnAvailability: boolean
}

function toFormValues(config: Config): DeliveryValues {
  return {
    queueWaitMinutes: msToMinutes(config.queueWaitTime),
    newEpisodeThresholdHours: msToHours(config.newEpisodeThreshold),
    notifyOnUpdate: config.notifyOnUpdate,
    watchlistAddNotify: config.watchlistAddNotify,
    notifyOnAvailability: config.notifyOnAvailability,
  }
}

function toPayload({
  queueWaitMinutes,
  newEpisodeThresholdHours,
  ...notify
}: DeliveryValues): ConfigUpdate {
  return {
    ...notify,
    queueWaitTime: minutesToMs(queueWaitMinutes),
    newEpisodeThreshold: hoursToMs(newEpisodeThresholdHours),
  }
}

export function useDeliveryForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: DeliveryFormSchema,
    toPayload,
  })
}
