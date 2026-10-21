import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'

export function ReleaseNotesSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-divider bg-inset px-3 py-2.5',
        className,
      )}
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
