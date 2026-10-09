import { useUserDirectory } from '@/hooks/useUserDirectory'
import { compareText } from '@/lib/format'

export function useRequesterOptions(): Array<{ value: number; label: string }> {
  const { users } = useUserDirectory()
  return users
    .map((user) => ({ value: user.id, label: user.name }))
    .sort((a, b) => compareText(a.label, b.label))
}
