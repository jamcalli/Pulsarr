import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserAvatar } from '@/components/user-avatar'
import { formatNumber } from '@/lib/format'

interface AvatarStackProps {
  people: Array<{ username: string; name: string; avatar?: string | null }>
  max?: number
}

export function AvatarStack({ people, max = 3 }: AvatarStackProps) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const overflow = people.length - shown.length
  const names = people.map((person) => person.name).join(', ')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span role="img" aria-label={names} className="flex items-center" />
        }
      >
        {shown.map((person) => (
          <UserAvatar
            key={person.username}
            name={person.name}
            avatar={person.avatar}
            size="sm"
            className="ring-2 ring-card not-first:-ml-2"
          />
        ))}
        {overflow > 0 && (
          <span className="relative -ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent pr-2 pl-2.5 text-xs font-bold ring-2 ring-card tabular-nums">
            +{formatNumber(overflow)}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{names}</TooltipContent>
    </Tooltip>
  )
}
