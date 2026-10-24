import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'

const Monitoring = ConfigUpdateSchema.shape.plexSessionMonitoring.unwrap()
const { shape } = Monitoring

// required() would report Zod's nonoptional message instead of each field's own error.
export const SessionMonitoringFormSchema = z.object({
  plexSessionMonitoring: Monitoring.extend({
    filterUsers: shape.filterUsers.unwrap(),
    enableAutoReset: shape.enableAutoReset.unwrap(),
    inactivityResetDays: shape.inactivityResetDays.unwrap(),
    autoResetIntervalHours: shape.autoResetIntervalHours.unwrap(),
    enableProgressiveCleanup: shape.enableProgressiveCleanup.unwrap(),
  }),
})
