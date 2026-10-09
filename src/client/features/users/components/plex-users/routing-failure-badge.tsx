import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRoutingFailureSummary } from '@/hooks/useRoutingFailureSummary'

/**
 * Flags a user whose watchlist has items that failed to reach Radarr or
 * Sonarr, linking to those items. Missing-ID items alone do not count.
 */
export function RoutingFailureBadge({ userId }: { userId: number }) {
  const { data } = useRoutingFailureSummary()
  const count =
    data?.summary.byUser.find((entry) => entry.userId === userId)?.actionable ??
    0

  if (count === 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/approvals/routing-failures?userId=${userId}`}
          aria-label={`${count} watchlist items failed to add`}
        >
          <Badge variant="warn" className="gap-1 px-1.5 tabular-nums">
            <AlertTriangle className="h-3 w-3" />
            {count}
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {count} watchlist {count === 1 ? 'item' : 'items'} failed to add to
          Radarr or Sonarr
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
