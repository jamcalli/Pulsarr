import { useCallback, useMemo } from 'react'
import { $api } from '@/lib/tanstackApi'

const USERS_STALE_MS = 5 * 60 * 1000

interface DirectoryEntry {
  alias: string | null
  avatar: string | null
}

/** `lookup` resolves a Plex username to its alias (or the username) and avatar case-insensitively, `users` lists every user by display name. */
export function useUserDirectory() {
  const { data } = $api.useQuery('get', '/v1/users/list', undefined, {
    staleTime: USERS_STALE_MS,
  })

  const entries = useMemo(
    () =>
      new Map<string, DirectoryEntry>(
        (data?.users ?? []).map((user) => [
          user.name.toLowerCase(),
          { alias: user.alias, avatar: user.avatar ?? null },
        ]),
      ),
    [data],
  )

  const users = useMemo(
    () =>
      (data?.users ?? []).map((user) => ({
        id: user.id,
        name: user.alias ?? user.name,
      })),
    [data],
  )

  const lookup = useCallback(
    (username: string) => {
      const entry = entries.get(username.toLowerCase())
      return { name: entry?.alias ?? username, avatar: entry?.avatar ?? null }
    },
    [entries],
  )

  return { lookup, users }
}
