import { useConfigStore } from '@/stores/configStore'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Displays a badge showing whether Apprise integration is enabled or disabled, with green for enabled and red for disabled.
 */
export function AppriseStatusBadge() {
  const config = useConfigStore(state => state.config)
  
  // Get status directly from config
  const isEnabled = config?.enableApprise || false
  const status = isEnabled ? 'enabled' : 'disabled'
  
  const getBadgeVariant = () => {
    if (isEnabled) {
      return 'bg-green-500 hover:bg-green-500 text-black'
    } else {
      return 'bg-red-500 hover:bg-red-500 text-black'
    }
  }
  
  return (
    <div className="ml-2 inline-flex items-center gap-2 h-full">
      <Badge 
        variant="neutral" 
        className={cn('px-2 py-0.5 h-7 text-sm', getBadgeVariant())}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  )
}