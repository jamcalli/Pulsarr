import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const QuotaSettingsFormSchema = ConfigUpdateSchema.pick({
  quotaSettings: true,
  watchlistCapNotify: true,
  watchlistCapNotifyUser: true,
}).required()
