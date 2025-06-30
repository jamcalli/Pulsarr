import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UtilitySectionHeaderProps {
  title: string
  description: string
  status?: 'enabled' | 'disabled' | 'failed' | 'unknown'
  showStatus?: boolean
  className?: string
}

/**
 * Displays a section header with a title, description, and an optional status badge for utility pages.
 *
 * The badge visually indicates the current status using color and label, supporting 'enabled', 'disabled', 'failed', and 'unknown' states. Additional CSS classes can be applied to the container.
 *
 * @param title - The section title to display.
 * @param description - The description text shown below the title.
 * @param status - The status to display in the badge; defaults to 'unknown' if not provided.
 * @param showStatus - Whether to show the status badge; defaults to true for backward compatibility.
 * @param className - Additional CSS classes for the container.
 */
export function UtilitySectionHeader({
  title,
  description,
  status = 'unknown',
  showStatus = true,
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
        {showStatus && (
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
        )}
      </div>
      <p className="text-sm text-foreground mt-1">{description}</p>
    </div>
  )
}