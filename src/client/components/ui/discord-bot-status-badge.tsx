import { useDiscordStatus } from '@/hooks/notifications/useDiscordStatus'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function DiscordStatusBadge() {
  const status = useDiscordStatus()
  
  const getBadgeVariant = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500 hover:bg-green-500 text-white'
      case 'starting':
        return 'bg-yellow-500 hover:bg-yellow-500 text-white'
      case 'stopping':
        return 'bg-orange-500 hover:bg-orange-500 text-white'
      case 'stopped':
        return 'bg-red-500 hover:bg-red-500 text-white'
      default:
        return 'bg-gray-400 hover:bg-gray-400 text-white'
    }
  }

  return (
    <div className="ml-2 inline-flex items-center">
      <Badge 
        variant="neutral" 
        className={cn('px-2 py-0.5 text-xs', getBadgeVariant())}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  )
}