import type { CreatableOption } from '@/hooks/useCreatableOptions'

interface DirectoryUser {
  id: number
  name: string
  username: string
}

/** Values are Pulsarr user ids, and a display name two users share gets the username added. */
export function monitoredUserOptions(
  users: readonly DirectoryUser[],
): CreatableOption[] {
  const counts = new Map<string, number>()
  for (const user of users) {
    counts.set(user.name, (counts.get(user.name) ?? 0) + 1)
  }
  return users.map((user) => ({
    value: String(user.id),
    label:
      (counts.get(user.name) ?? 0) > 1
        ? `${user.name} (${user.username})`
        : user.name,
  }))
}
