import { useCallback, useMemo } from 'react'
import { $api } from '@/lib/tanstackApi'
import { displayName } from '@/lib/user-naming'

const USERS_STALE_MS = 5 * 60 * 1000

interface DirectoryEntry {
  id: number
  alias: string | null
  avatar: string | null
}

/** `lookup` resolves a Plex username to its alias (or the username), avatar and user id (null when unknown) case-insensitively, `users` lists every user by display name. */
export function useUserDirectory() {
  const { data } = $api.useQuery('get', '/v1/users/list', undefined, {
    staleTime: USERS_STALE_MS,
  })

  const entries = useMemo(
    () =>
      new Map<string, DirectoryEntry>(
        (data?.users ?? []).map((user) => [
          user.name.toLowerCase(),
          { id: user.id, alias: user.alias, avatar: user.avatar ?? null },
        ]),
      ),
    [data],
  )

  const users = useMemo(
    () =>
      (data?.users ?? []).map((user) => ({
        id: user.id,
        name: displayName(user),
        username: user.name,
      })),
    [data],
  )

  const lookup = useCallback(
    (username: string) => {
      const entry = entries.get(username.toLowerCase())
      return {
        id: entry?.id ?? null,
        name: entry?.alias ?? username,
        avatar: entry?.avatar ?? null,
      }
    },
    [entries],
  )

  return { lookup, users }
}
