import { cn } from 'cn'
import { useCallback, useState } from 'react'
import { CredenzaTitle } from '@/components/credenza'
import { PosterFrame, PosterFrameSkeleton } from '@/components/poster-frame'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RatingRow } from '@/features/home/components/media-detail/rating-row'
import {
  heroMeta,
  type MediaMetadata,
  mediaRatings,
} from '@/features/home/lib/media-facts'
import type { MediaItem } from '@/features/home/lib/media-item'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import { formatList } from '@/lib/format'

const HERO_PAD = 'px-4 pt-14 pb-5 md:px-6 md:pt-16 md:pb-6'

export function MediaBackdrop({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  const imageRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setLoaded(true)
  }, [])

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <img
        ref={imageRef}
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        className={cn(
          'size-full object-cover object-top transition-opacity duration-300 motion-reduce:transition-none',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="absolute inset-0 bg-linear-to-b from-card/35 via-card/90 via-55% to-card" />
    </div>
  )
}

export function MediaHero({
  item,
  metadata,
}: {
  item: MediaItem
  metadata?: MediaMetadata
}) {
  const details = metadata?.details
  const meta = details ? heroMeta(details) : null
  const genres = details?.genres ?? []
  const metaLine = formatList(
    [CONTENT_TYPE_LABELS[item.type], meta?.year, meta?.runtime].filter(
      (part) => part != null,
    ),
  )

  return (
    <div className="relative">
      <div className={cn('relative flex items-end gap-5', HERO_PAD)}>
        <PosterFrame
          thumb={details?.poster_path ?? item.thumb}
          type={item.type}
          size="hero"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm text-muted-foreground">{metaLine}</p>
          <CredenzaTitle className="font-heading text-2xl font-bold md:text-3xl">
            {item.title}
          </CredenzaTitle>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <Badge key={genre.id} variant="secondary">
                  {genre.name}
                </Badge>
              ))}
            </div>
          )}
          {metadata && <RatingRow ratings={mediaRatings(metadata)} />}
        </div>
      </div>
    </div>
  )
}

export function MediaHeroSkeleton({ title }: { title: string }) {
  return (
    <div className="relative">
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className={cn('relative flex items-end gap-5', HERO_PAD)}>
        <PosterFrameSkeleton size="hero" />
        <div className="flex flex-1 flex-col justify-end gap-2">
          <CredenzaTitle className="sr-only">{title}</CredenzaTitle>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-64 max-w-full" />
        </div>
      </div>
    </div>
  )
}
