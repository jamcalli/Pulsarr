import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const UserTagsFormSchema = ConfigUpdateSchema.pick({
  tagUsersInSonarr: true,
  tagUsersInRadarr: true,
  cleanupOrphanedTags: true,
  removedTagMode: true,
  removedTagPrefix: true,
  tagPrefix: true,
  tagNamingSource: true,
}).required()
