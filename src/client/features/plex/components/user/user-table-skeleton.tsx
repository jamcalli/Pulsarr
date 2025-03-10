import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

export default function UserTableSkeletonRows({
  colSpan = 5,
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
              <TableCell className="px-2 py-2">
                <Skeleton className="h-6 w-48" />
              </TableCell>
              <TableCell className="px-2 py-2 hidden sm:table-cell">
                <Skeleton className="h-6 w-6 mx-auto" />
              </TableCell>
              <TableCell className="px-2 py-2 hidden xs:table-cell">
                <Skeleton className="h-6 w-6 mx-auto" />
              </TableCell>
              <TableCell className="px-2 py-2">
                <Skeleton className="h-6 w-10 ml-auto" />
              </TableCell>
              <TableCell className="px-2 py-2 w-8">
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </>
          )}
        </TableRow>
      ))}
    </>
  )
}
