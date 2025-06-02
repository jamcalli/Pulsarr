import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ColumnConfig {
  width?: string
  className?: string
  hideOnMobile?: boolean
  type?: 'text' | 'badge' | 'icon' | 'button' | 'checkbox'
}

interface TableSkeletonProps {
  /**
   * Number of skeleton rows to display. 
   * Should match pagination size to prevent layout shift.
   * Defaults to 10.
   */
  rows?: number
  /**
   * Configuration for each column
   */
  columns: ColumnConfig[]
  /**
   * Whether to show table headers
   */
  showHeader?: boolean
  /**
   * Optional className for the table
   */
  className?: string
}

/**
 * Unified table skeleton component that prevents layout shift
 * by matching the expected content size and structure.
 */
export function TableSkeleton({
  rows = 10,
  columns,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  // Generate unique keys for skeleton rows
  const skeletonKeys = Array.from({ length: rows }, (_, i) => `skeleton-${i}`)

  const getSkeletonHeight = (type?: ColumnConfig['type']) => {
    switch (type) {
      case 'badge':
      case 'button':
        return 'h-6'
      case 'checkbox':
        return 'h-4'
      case 'icon':
        return 'h-5'
      default:
        return 'h-4'
    }
  }

  const getSkeletonWidth = (type?: ColumnConfig['type'], width?: string) => {
    if (width) return width
    
    switch (type) {
      case 'checkbox':
        return 'w-4'
      case 'icon':
        return 'w-5'
      case 'button':
        return 'w-20'
      case 'badge':
        return 'w-16'
      default:
        return 'w-32'
    }
  }

  return (
    <Table className={className}>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={`header-${index}`}
                className={`px-2 py-2 ${column.className || ''} ${
                  column.hideOnMobile ? 'hidden sm:table-cell' : ''
                }`}
              >
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {skeletonKeys.map((key) => (
          <TableRow key={key} className="min-h-[48px]">
            {columns.map((column, index) => (
              <TableCell
                key={`${key}-${index}`}
                className={`px-2 py-2 ${column.className || ''} ${
                  column.hideOnMobile ? 'hidden sm:table-cell' : ''
                }`}
              >
                <Skeleton
                  className={`${getSkeletonHeight(column.type)} ${getSkeletonWidth(
                    column.type,
                    column.width,
                  )} ${column.type === 'checkbox' ? 'rounded' : ''}`}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Alternative minimal skeleton that shows a single loading block
 * instead of individual rows. Use when exact row count is unknown.
 */
export function TableSkeletonMinimal({
  height = '400px',
  className,
}: {
  height?: string
  className?: string
}) {
  return (
    <div className={`w-full ${className}`}>
      <Skeleton className={`w-full ${height} rounded-md`} />
    </div>
  )
}

/**
 * Simple loading state for tables with typically sparse data (1-3 rows).
 * Shows a centered loading spinner with optional message.
 */
export function TableLoadingState({
  message = 'Loading...',
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div 
      className={`flex flex-col items-center justify-center py-12 ${className || ''}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <Loader2 
        className="h-8 w-8 animate-spin text-muted-foreground mb-3"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}