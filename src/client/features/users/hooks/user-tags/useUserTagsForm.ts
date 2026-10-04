import { TaggingConfigSchema } from '@root/schemas/tags/user-tags.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

type UserTagsFormValues = Pick<
  Config,
  | 'tagUsersInSonarr'
  | 'tagUsersInRadarr'
  | 'cleanupOrphanedTags'
  | 'removedTagMode'
  | 'removedTagPrefix'
  | 'tagPrefix'
  | 'tagNamingSource'
>

function toFormValues(config: Config): UserTagsFormValues {
  return {
    tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
    tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
    cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
    removedTagMode: config.removedTagMode || 'remove',
    removedTagPrefix: config.removedTagPrefix || 'pulsarr-removed',
    tagPrefix: config.tagPrefix || 'pulsarr-user',
    tagNamingSource: config.tagNamingSource || 'username',
  }
}

export function useUserTagsForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: TaggingConfigSchema,
  })
}
