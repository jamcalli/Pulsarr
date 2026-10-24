import { UPDATE_NOTIFY_OPTIONS } from '@root/schemas/config/config.schema'
import { withStoredOption } from '@/lib/select-options'
import type { components } from '@/types/api.js'

type DeleteSyncNotifyOption = components['schemas']['DeleteSyncNotifyOption']
type UpdateNotifyOption = components['schemas']['UpdateNotifyOption']

export const NOTIFY_OPTION_LABELS: Record<UpdateNotifyOption, string> = {
  all: 'All channels',
  'apprise-only': 'Apprise only',
  'discord-only': 'Discord webhook and direct messages',
  'dm-only': 'Discord direct messages only',
  'webhook-only': 'Discord webhook only',
  none: 'None',
}

const NOTIFY_OPTION_EQUIVALENTS: Record<
  DeleteSyncNotifyOption,
  UpdateNotifyOption
> = {
  none: 'none',
  all: 'all',
  'discord-only': 'discord-only',
  'apprise-only': 'apprise-only',
  'webhook-only': 'webhook-only',
  'dm-only': 'dm-only',
  'discord-webhook': 'webhook-only',
  'discord-message': 'dm-only',
  'discord-both': 'discord-only',
  message: 'dm-only',
  webhook: 'webhook-only',
  both: 'discord-only',
}

export const UPDATE_NOTIFY_SELECT_OPTIONS = UPDATE_NOTIFY_OPTIONS.map(
  (value) => ({ value, label: NOTIFY_OPTION_LABELS[value] }),
)

/** A stored legacy alias stays selectable under the label of the option it routes like, so it saves back unchanged. */
export function notifyOptions(stored: DeleteSyncNotifyOption) {
  return withStoredOption(
    UPDATE_NOTIFY_SELECT_OPTIONS,
    stored,
    NOTIFY_OPTION_LABELS[NOTIFY_OPTION_EQUIVALENTS[stored]],
  )
}
