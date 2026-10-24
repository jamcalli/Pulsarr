import { useMemo } from 'react'
import type { Recipient } from '@/features/notifications/lib/recipients'
import { $api } from '@/lib/tanstackApi'
import type { paths } from '@/types/api.js'

export type RecipientUser =
  paths['/v1/users/list']['get']['responses'][200]['content']['application/json']['users'][number]

/** Sorted by display name, and `toRecipient` must be referentially stable. */
export function useRecipients<Id extends string | number>(
  toRecipient: (user: RecipientUser) => Recipient<Id> | null,
) {
  const { data } = $api.useQuery('get', '/v1/users/list')

  return useMemo(() => {
    const recipients: Recipient<Id>[] = []
    for (const user of data?.users ?? []) {
      const recipient = toRecipient(user)
      if (recipient) recipients.push(recipient)
    }
    return recipients.sort((a, b) => a.name.localeCompare(b.name))
  }, [data, toRecipient])
}
