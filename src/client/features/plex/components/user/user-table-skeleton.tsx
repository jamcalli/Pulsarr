import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

export default function UserTableSkeletonRows({
  colSpan = 7, // Updated default to include checkbox column
}: { colSpan?: number }) {
  const skeletonRows = Array.from({ length: 10 }, (_, i) => `skeleton-row-${i}`)

  return (
    <>
      {skeletonRows.map((key) => (
        <TableRow key={key}>
          {colSpan === 1 ? (
            <TableCell colSpan={colSpan} className="px-2 py-2">
              <Skeleton className="h-6 w-full" />
            </TableCell>
          ) : (
            <>
              {/* Checkbox cell */}
              <TableCell className="px-2 py-2 w-8">
                <Skeleton className="h-4 w-4 rounded-sm" />
              </TableCell>

              {/* Username cell - always visible */}
              <TableCell className="px-2 py-2">
                <div className="flex flex-col space-y-1">
                  <Skeleton className="h-4 w-32" />
                </div>
              </TableCell>

              {/* Email notification cell - hidden on screens smaller than md */}
              <TableCell className="px-2 py-2 hidden md:table-cell">
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </TableCell>

              {/* Discord notification cell - hidden on screens smaller than md */}
              <TableCell className="px-2 py-2 hidden md:table-cell">
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </TableCell>

              {/* Can Sync status cell - hidden on extra small screens */}
              <TableCell className="px-2 py-2 hidden xs:table-cell">
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </TableCell>

              {/* Watchlist count cell - always visible */}
              <TableCell className="px-2 py-2 text-right">
                <Skeleton className="h-4 w-10 ml-auto" />
              </TableCell>

              {/* Actions cell - always visible */}
              <TableCell className="px-2 py-2 w-8">
                <Skeleton className="h-8 w-8 ml-auto" />
              </TableCell>
            </>
          )}
        </TableRow>
      ))}
    </>
  )
}
