import imdbIcon from '@/assets/images/rating-icons/imdb.svg'
import metacriticIcon from '@/assets/images/rating-icons/metacritic.svg'
import rtAudFreshIcon from '@/assets/images/rating-icons/rt-aud-fresh.svg'
import rtAudRottenIcon from '@/assets/images/rating-icons/rt-aud-rotten.svg'
import rtFreshIcon from '@/assets/images/rating-icons/rt-fresh.svg'
import rtRottenIcon from '@/assets/images/rating-icons/rt-rotten.svg'
import tmdbIcon from '@/assets/images/rating-icons/tmdb.svg'
import traktIcon from '@/assets/images/rating-icons/trakt.svg'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Rating, RatingIcon } from '@/features/home/lib/media-facts'
import { formatNumber } from '@/lib/format'

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

export function RatingRow({ ratings }: { ratings: Rating[] }) {
  if (ratings.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ratings.map((rating) => (
        <li key={rating.name}>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-sm text-sm font-bold tabular-nums outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
                />
              }
            >
              <img
                src={ICONS[rating.icon]}
                alt={rating.name}
                className="size-5"
              />
              {rating.value}
              {rating.outOf && (
                <span className="font-normal text-muted-foreground">
                  /{formatNumber(rating.outOf)}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>{rating.name}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}
