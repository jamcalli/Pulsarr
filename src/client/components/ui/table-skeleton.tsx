import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
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
  type?: 'text' | 'badge' | 'icon' | 'button' | 'checkbox' | 'twoLine' | 'contentWithIcon' | 'avatar' | 'empty'
  align?: 'left' | 'center' | 'right'
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
 * Displays a skeleton table that visually mimics the final table layout while data is loading.
 *
 * Each skeleton cell adapts its size and style according to the provided column configuration, including type, width, and visibility. An optional header skeleton can be shown to match the expected table structure. This component helps prevent layout shifts and provides a consistent loading experience for tables.
 *
 * @param rows - Number of skeleton rows to display. Defaults to 10.
 * @param columns - Array describing each column's type, width, visibility, and custom class names.
 * @param showHeader - Whether to display a skeleton header row. Defaults to true.
 * @param className - Optional CSS class for the table.
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
                {column.type === 'checkbox' ? (
                  <Skeleton className="h-4 w-4 rounded-xs" />
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
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
                {column.type === 'avatar' ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                    <Skeleton className={`h-4 ${column.width || 'w-24'}`} />
                  </div>
                ) : (
                  <Skeleton
                    className={`${getSkeletonHeight(column.type)} ${getSkeletonWidth(
                      column.type,
                      column.width,
                    )} ${column.type === 'checkbox' ? 'rounded-xs' : ''}`}
                  />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Renders a minimal table skeleton as a single full-width loading block.
 *
 * Use this component when the number of table rows is unknown or a simple placeholder is preferred.
 *
 * @param height - The height of the skeleton block (default: '400px').
 * @param className - Optional CSS class for custom styling.
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
 * Displays a centered loading spinner and message for tables with sparse data.
 *
 * @param message - Optional loading message to display below the spinner.
 * @param className - Optional CSS class for additional container styling.
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

interface TableRowsSkeletonProps {
  rows: number
  columnCount: number
  columns?: ColumnConfig[]
}

/**
 * Renders skeleton rows for use inside an existing table body.
 * Keeps header, toolbar, and pagination visible while only row content shows loading state.
 */
export function TableRowsSkeleton({
  rows,
  columnCount,
  columns,
}: TableRowsSkeletonProps) {
  const columnConfigs: ColumnConfig[] =
    columns || Array.from({ length: columnCount }, () => ({ type: 'text' }))

  const renderSkeletonContent = (column: ColumnConfig) => {
    switch (column.type) {
      // Empty cell (for hidden columns that still render a cell)
      case 'empty':
        return null

      // Round avatar + single line text (like Username with avatar)
      case 'avatar':
        return (
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <Skeleton className={`h-4 ${column.width || 'w-24'}`} />
          </div>
        )

      // Icon + two lines (like Content column with icon, title, subtitle)
      case 'contentWithIcon':
        return (
          <div className="flex items-center gap-2 max-w-[300px]">
            <Skeleton className="h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <Skeleton className={`h-4 ${column.width || 'w-40'}`} />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        )

      // Two lines centered (like date + time) - matches text-center div structure
      case 'twoLine':
        return (
          <div className="text-center">
            <Skeleton className={`h-4 ${column.width || 'w-16'} mx-auto`} />
            <Skeleton className="h-3 w-10 mt-1 mx-auto" />
          </div>
        )

      // Badge centered - matches flex justify-center structure
      case 'badge':
        return (
          <div className="flex justify-center">
            <Skeleton className={`h-6 ${column.width || 'w-16'}`} />
          </div>
        )

      case 'checkbox':
        return <Skeleton className="h-4 w-4 rounded-xs" />

      // Button/actions - matches flex items-center gap-1 structure
      case 'button':
        return (
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-8" />
          </div>
        )

      case 'icon':
        return <Skeleton className="h-5 w-5" />

      // Default text - left aligned
      default:
        return <Skeleton className={`h-4 ${column.width || 'w-24'}`} />
    }
  }

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={`skeleton-row-${rowIndex}`}>
          {columnConfigs.map((column, colIndex) => (
            <TableCell
              key={`skeleton-cell-${rowIndex}-${colIndex}`}
              className={`px-2 py-2 ${column.className || ''} ${
                column.hideOnMobile ? 'hidden sm:table-cell' : ''
              }`}
            >
              {renderSkeletonContent(column)}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}