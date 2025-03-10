import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function UserTableSkeleton() {
  const skeletonRows = Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 py-2">
                <Skeleton className="h-8 w-28" />
              </TableHead>
              <TableHead className="px-2 py-2 hidden sm:table-cell">
                <Skeleton className="h-8 w-16" />
              </TableHead>
              <TableHead className="px-2 py-2 hidden xs:table-cell">
                <Skeleton className="h-8 w-16" />
              </TableHead>
              <TableHead className="px-2 py-2">
                <Skeleton className="h-8 w-16" />
              </TableHead>
              <TableHead className="px-2 py-2 w-8">
                <Skeleton className="h-8 w-8" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skeletonRows.map((key) => (
              <TableRow key={key}>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-2 py-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-6 w-32" />
        <div className="space-x-2">
          <Skeleton className="h-8 w-24 inline-block" />
          <Skeleton className="h-8 w-24 inline-block" />
        </div>
      </div>
    </div>
  )
}
