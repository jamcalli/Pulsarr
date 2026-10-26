import imdbIcon from '@/assets/images/rating-icons/imdb.svg'
import metacriticIcon from '@/assets/images/rating-icons/metacritic.svg'
import rtAudFreshIcon from '@/assets/images/rating-icons/rt-aud-fresh.svg'
import rtAudRottenIcon from '@/assets/images/rating-icons/rt-aud-rotten.svg'
import rtFreshIcon from '@/assets/images/rating-icons/rt-fresh.svg'
import rtRottenIcon from '@/assets/images/rating-icons/rt-rotten.svg'
import tmdbIcon from '@/assets/images/rating-icons/tmdb.svg'
import traktIcon from '@/assets/images/rating-icons/trakt.svg'
import { linkUnderline } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import type { Rating, RatingIcon } from '@/lib/media-facts'

const ROW = 'flex flex-wrap items-center gap-x-4 gap-y-2'
const SKELETON_RATINGS = ['a', 'b', 'c']
const TRIGGER = 'flex items-center gap-1.5 text-sm font-bold tabular-nums'
const LINK = `${TRIGGER} ${linkUnderline} rounded-sm outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0`

const ICONS: Record<RatingIcon, string> = {
  tmdb: tmdbIcon,
  imdb: imdbIcon,
  'rt-fresh': rtFreshIcon,
  'rt-rotten': rtRottenIcon,
  'rt-aud-fresh': rtAudFreshIcon,
  'rt-aud-rotten': rtAudRottenIcon,
  metacritic: metacriticIcon,
  trakt: traktIcon,
}

function RatingValue({ rating }: { rating: Rating }) {
  return (
    <>
      <img src={ICONS[rating.icon]} alt={rating.name} className="size-5" />
      <span>
        {rating.value}
        {rating.outOf && (
          <span className="font-normal text-muted-foreground">
            /{formatNumber(rating.outOf)}
          </span>
        )}
      </span>
    </>
  )
}

function RatingTrigger({ rating }: { rating: Rating }) {
  if (rating.url) {
    return (
      <TooltipTrigger
        render={
          <a
            href={rating.url}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          />
        }
      >
        <RatingValue rating={rating} />
      </TooltipTrigger>
    )
  }
  return (
    <TooltipTrigger render={<span className={TRIGGER} />}>
      <RatingValue rating={rating} />
    </TooltipTrigger>
  )
}

export function RatingRow({ ratings }: { ratings: Rating[] }) {
  if (ratings.length === 0) return null
  return (
    <ul className={ROW}>
      {ratings.map((rating) => (
        <li key={rating.name}>
          <Tooltip>
            <RatingTrigger rating={rating} />
            <TooltipContent>{rating.name}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

export function RatingRowSkeleton() {
  return (
    <div className={ROW}>
      {SKELETON_RATINGS.map((key) => (
        <Skeleton key={key} className="h-5 w-14" />
      ))}
    </div>
  )
}
