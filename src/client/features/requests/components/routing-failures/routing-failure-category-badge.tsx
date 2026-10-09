import type { RoutingFailureCategory } from '@root/types/routing-failure.types'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const ROUTING_FAILURE_CATEGORY_META: Record<
  RoutingFailureCategory,
  { label: string; description: string; lowSeverity: boolean }
> = {
  arr_error: {
    label: 'Rejected',
    description:
      'Radarr or Sonarr refused the add, for example a wrong ID, a missing root folder or an invalid quality profile.',
    lowSeverity: false,
  },
  instance_unavailable: {
    label: 'Unreachable',
    description:
      'The instance could not be reached or is not set up. Retry once it is back.',
    lowSeverity: false,
  },
  no_route: {
    label: 'No route',
    description:
      'No router rule matched and there is no usable default instance.',
    lowSeverity: false,
  },
  routing_error: {
    label: 'Error',
    description:
      'Routing failed before an add was attempted. Check the logs for details.',
    lowSeverity: false,
  },
  missing_ids: {
    label: 'Missing IDs',
    description:
      'The item has no TMDB or TVDB ID, which is common for webisodes and specials. It can never be added and needs no action.',
    lowSeverity: true,
  },
}

export function RoutingFailureCategoryBadge({
  category,
}: {
  category: RoutingFailureCategory
}) {
  const meta = ROUTING_FAILURE_CATEGORY_META[category]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={meta.lowSeverity ? 'neutral' : 'warn'}
          className="whitespace-nowrap cursor-help"
        >
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{meta.description}</p>
      </TooltipContent>
    </Tooltip>
  )
}
