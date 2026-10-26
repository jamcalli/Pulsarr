import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const PublicContentFormSchema =
  ConfigUpdateSchema.shape.publicContentNotifications.unwrap().required()
