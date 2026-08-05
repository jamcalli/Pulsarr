import { useMemo } from 'react'
import { useUsers } from '@/features/plex/hooks/usePlexUsers'

export interface UserOption {
  label: string
  value: string
}

export interface UseUserOptionsResult {
  options: UserOption[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * Returns a memoized list of user options for select/multi-select components.
 *
 * Formats users into select options:
 * - Label: "name (alias)" if alias exists, otherwise just "name"
 * - Value: user ID as string
 * - Sorted alphabetically by label
 *
 * @returns Object with options array and loading state
 *
 * @example
 * ```typescript
 * const { options, isLoading } = useUserOptions()
 * // options: [{ label: "John Smith (Johnny)", value: "1" }, { label: "Jane Doe", value: "2" }]
 * ```
 */
export function useUserOptions(): UseUserOptionsResult {
  const { data, isLoading, isError, refetch } = useUsers()
  const users = data?.users ?? null

  const options = useMemo(() => {
    if (!users) return []
    return users
      .map((user) => ({
        label: user.alias ? `${user.name} (${user.alias})` : user.name,
        value: user.id.toString(),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [users])

  return {
    options,
    isLoading,
    isError,
    refetch,
  }
}
