import { useMemo } from 'react'
import { $api } from '@/lib/tanstackApi'
import { displayName } from '@/lib/user-naming'

export interface DiscordRecipient {
  discordId: string
  name: string
}

/** Users with a saved Discord ID, by display name. */
export function useDiscordRecipients() {
  const { data } = $api.useQuery('get', '/v1/users/list')

  return useMemo(() => {
    const recipients: DiscordRecipient[] = []
    for (const user of data?.users ?? []) {
      if (user.discord_id) {
        recipients.push({ discordId: user.discord_id, name: displayName(user) })
      }
    }
    return recipients.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])
}
