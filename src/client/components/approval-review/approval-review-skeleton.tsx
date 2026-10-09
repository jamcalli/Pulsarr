import { CredenzaTitle } from '@/components/credenza'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const ROUTING_ROWS = ['instance', 'profile', 'tags', 'folder', 'search', 'type']
const ROUTING_FIELDS = [
  'instance',
  'profile',
  'folder',
  'monitoring',
  'type',
  'search',
  'tags',
]

export function ApprovalReviewSkeleton({
  variant,
}: {
  variant: 'standalone' | 'embedded'
}) {
  return (
    <div className="flex flex-col gap-6">
      {variant === 'standalone' && (
        <>
          <div className="flex items-start gap-4 md:pr-8">
            <PosterFrameSkeleton size="identity" />
            <div className="flex flex-1 flex-col gap-2">
              <CredenzaTitle className="sr-only">Loading request</CredenzaTitle>
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-8 w-64 max-w-full" />
              <Skeleton className="h-6 w-56 max-w-full" />
            </div>
          </div>
          <Separator />
        </>
      )}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {ROUTING_ROWS.map((row) => (
            <div key={row} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ApprovalReviewFooterSkeleton() {
  return (
    <div className="flex gap-2 p-4 pt-0 md:px-6 md:pb-6">
      <Skeleton className="mr-auto h-10 w-24" />
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-24" />
    </div>
  )
}

export function ApprovalRoutingFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-full max-w-md" />
      {ROUTING_FIELDS.map((row) => (
        <div key={row} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}
