import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/user-avatar'

interface PersonPillProps {
  name: string
  avatar?: string | null
}

export function PersonPill({ name, avatar }: PersonPillProps) {
  return (
    <Badge
      variant="outline"
      className="h-8 gap-2 rounded-full pr-3 pl-1 text-sm"
    >
      <UserAvatar name={name} avatar={avatar} size="sm" />
      {name}
    </Badge>
  )
}
