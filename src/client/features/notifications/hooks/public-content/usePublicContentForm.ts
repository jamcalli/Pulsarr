import { PublicContentFormSchema } from '@/features/notifications/lib/public-content-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

export function usePublicContentForm(config: Config) {
  return useConfigForm({
    config,
    toValues: (saved) => saved.publicContentNotifications,
    schema: PublicContentFormSchema,
    toPayload: (values) => ({ publicContentNotifications: values }),
  })
}
