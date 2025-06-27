import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UtilitySectionHeaderProps {
  title: string
  description: string
  status?: 'enabled' | 'disabled' | 'failed' | 'unknown'
  className?: string
}

/**
 * A reusable header component for utility sections that displays a title, description, and status badge.
 *
 * Provides consistent styling and status indication for utility pages, matching the pattern
 * used in accordion headers throughout the application.
 */
export function UtilitySectionHeader({
  title,
  description,
  status = 'unknown',
  className,
}: UtilitySectionHeaderProps) {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'enabled':
        return 'bg-green-500 hover:bg-green-500 text-black'
      case 'failed':
        return 'bg-yellow-500 hover:bg-yellow-500 text-black'
      case 'disabled':
        return 'bg-red-500 hover:bg-red-500 text-black'
      default:
        return 'bg-gray-500 hover:bg-gray-500 text-black'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'enabled':
        return 'Enabled'
      case 'disabled':
        return 'Disabled'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className={cn('mb-6', className)}>
      <div className="flex items-center">
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <div className="ml-2 inline-flex items-center gap-2 h-full">
          <Badge
            variant="neutral"
            className={cn(
              'px-2 py-0.5 h-7 text-sm',
              getStatusStyles(status),
            )}
          >
            {getStatusText(status)}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-foreground mt-1">{description}</p>
    </div>
  )
}