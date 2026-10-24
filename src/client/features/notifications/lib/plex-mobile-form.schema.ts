import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const PlexMobileFormSchema = ConfigUpdateSchema.pick({
  plexMobileEnabled: true,
}).required()
