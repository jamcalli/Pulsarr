import { useConfigStore } from '@/stores/configStore'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function AppriseStatusBadge() {
  const config = useConfigStore(state => state.config)
  
  // Get status directly from config
  const isEnabled = config?.enableApprise || false
  const status = isEnabled ? 'enabled' : 'disabled'
  
  const getBadgeVariant = () => {
    if (isEnabled) {
      return 'bg-green-500 hover:bg-green-500 text-white'
    } else {
      return 'bg-red-500 hover:bg-red-500 text-white'
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