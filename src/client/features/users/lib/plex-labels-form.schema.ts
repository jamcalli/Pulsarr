import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const PlexLabelsFormSchema = ConfigUpdateSchema.pick({
  plexLabelSync: true,
}).required()
