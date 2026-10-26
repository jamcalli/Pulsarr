import { UserTagsFormSchema } from '@/features/users/lib/user-tags-form.schema'
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
    tagUsersInSonarr: config.tagUsersInSonarr,
    tagUsersInRadarr: config.tagUsersInRadarr,
    cleanupOrphanedTags: config.cleanupOrphanedTags,
    removedTagMode: config.removedTagMode,
    removedTagPrefix: config.removedTagPrefix,
    tagPrefix: config.tagPrefix,
    tagNamingSource: config.tagNamingSource,
  }
}

export function useUserTagsForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: UserTagsFormSchema,
  })
}
