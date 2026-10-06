import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Film, Tv } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useImageFallback } from '@/hooks/useImageFallback'
import { posterCardUrl } from '@/lib/poster-url'

const posterSizes = cva('aspect-2/3 shrink-0', {
  variants: {
    size: {
      thumb: 'w-10 rounded-sm',
      fill: 'w-full rounded-md',
      identity: 'w-20 rounded-md md:w-24',
      hero: 'w-24 rounded-md md:w-36',
    },
  },
  defaultVariants: {
    size: 'fill',
  },
})

type PosterSize = NonNullable<VariantProps<typeof posterSizes>['size']>

const ICON_SIZES: Record<PosterSize, string> = {
  thumb: 'size-4',
  fill: 'size-8',
  identity: 'size-8',
  hero: 'size-8',
}

interface PosterFrameProps {
  thumb: string | null
  type: 'movie' | 'show'
  size?: PosterSize
}

export function PosterFrame({ thumb, type, size = 'fill' }: PosterFrameProps) {
  const { src, onError } = useImageFallback(posterCardUrl(thumb))
  const PlaceholderIcon = type === 'movie' ? Film : Tv
  return (
    <div
      className={cn(
        posterSizes({ size }),
        'relative overflow-hidden border-2 border-border bg-accent',
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={onError}
          className="size-full object-cover"
        />
      ) : (
        <div
          data-slot="poster-placeholder"
          className="flex size-full items-center justify-center text-muted-foreground"
        >
          <PlaceholderIcon className={ICON_SIZES[size]} />
        </div>
      )}
    </div>
  )
}

export function PosterFrameSkeleton({ size = 'fill' }: { size?: PosterSize }) {
  return <Skeleton className={posterSizes({ size })} />
}
