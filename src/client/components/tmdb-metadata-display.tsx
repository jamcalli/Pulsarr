import type { TmdbMetadataSuccessResponse } from '@root/schemas/tmdb/tmdb.schema'
import { Calendar, Clock, ExternalLink, Film, Tv } from 'lucide-react'
// Import rating service icons
import imdbIcon from '@/assets/images/rating-icons/imdb.svg'
import metacriticIcon from '@/assets/images/rating-icons/metacritic.svg'
import rtAudFreshIcon from '@/assets/images/rating-icons/rt-aud-fresh.svg'
import rtAudRottenIcon from '@/assets/images/rating-icons/rt-aud-rotten.svg'
import rtFreshIcon from '@/assets/images/rating-icons/rt-fresh.svg'
import rtRottenIcon from '@/assets/images/rating-icons/rt-rotten.svg'
import tmdbIcon from '@/assets/images/rating-icons/tmdb.svg'
import traktIcon from '@/assets/images/rating-icons/trakt.svg'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TmdbRegionSelector } from '@/components/ui/tmdb-region-selector'
import { useConfigStore } from '@/stores/configStore'

interface TmdbMetadataDisplayProps {
  data: TmdbMetadataSuccessResponse
  onRegionChange?: () => Promise<void>
}

/**
 * Displays detailed TMDB metadata for a movie or TV show, including overview, ratings, and region-specific watch providers.
 *
 * Shows title, release year, runtime, genres, ratings from multiple sources, and additional details depending on whether the item is a movie or TV show. Allows users to select a region to filter available streaming, rental, and purchase providers, and optionally triggers a callback when the region changes.
 *
 * @param data - TMDB metadata response containing details and watch provider information
 * @param onRegionChange - Optional callback invoked after the region is changed, typically to refetch metadata
 */
export function TmdbMetadataDisplay({
  data,
  onRegionChange,
}: TmdbMetadataDisplayProps) {
  const { metadata } = data
  const { details, watchProviders } = metadata
  const radarrRatings =
    'radarrRatings' in metadata ? metadata.radarrRatings : undefined
  const plexRatings =
    'plexRatings' in metadata ? metadata.plexRatings : undefined
  const config = useConfigStore((state) => state.config)

  // Check if it's movie or TV show based on the presence of 'title' vs 'name'
  const isMovie = 'title' in details
  const title = isMovie ? details.title : details.name
  const releaseDate = isMovie ? details.release_date : details.first_air_date
  const posterUrl = details.poster_path
    ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
    : null
  const backdropUrl = details.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
    : null

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return null
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatLanguage = (langCode: string) => {
    const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
    try {
      return languageNames.of(langCode) || langCode.toUpperCase()
    } catch {
      return langCode.toUpperCase()
    }
  }

  return (
    <div className="relative min-h-full">
      {/* Backdrop Image */}
      {backdropUrl && (
        <div className="absolute inset-0 -z-10 overflow-hidden rounded-lg">
          <img
            src={backdropUrl}
            alt={`${title} backdrop`}
            className="w-full h-full object-cover opacity-50"
          />
        </div>
      )}

      <div className={`space-y-4 ${backdropUrl ? 'p-4' : ''}`}>
        <div className="relative flex gap-4">
          {/* Poster */}
          {posterUrl && (
            <div className="shrink-0 w-32">
              <AspectRatio ratio={2 / 3}>
                <img
                  src={posterUrl}
                  alt={`${title} poster`}
                  className="h-full w-full object-cover rounded-lg border border-border shadow-lg"
                  loading="lazy"
                />
              </AspectRatio>
            </div>
          )}

          {/* Basic Info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isMovie ? (
                <Film className="w-4 h-4" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
              <span className="capitalize">
                {isMovie ? 'Movie' : 'TV Show'}
              </span>
            </div>

            <h4 className="font-semibold text-lg text-foreground">{title}</h4>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {releaseDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(releaseDate).getFullYear()}</span>
                </div>
              )}

              {isMovie && details.runtime && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatRuntime(details.runtime)}</span>
                </div>
              )}

              {!isMovie &&
                details.episode_run_time &&
                details.episode_run_time.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>
                      {formatRuntime(details.episode_run_time[0])} per episode
                    </span>
                  </div>
                )}
            </div>

            {/* Genres */}
            {details.genres && details.genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {details.genres.map((genre) => (
                  <Badge key={genre.id} variant="neutral" className="text-xs">
                    {genre.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Ratings - Unified display for movies and shows */}
            {(radarrRatings || plexRatings || details.vote_average > 0) && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {/* TMDB - from details or plexRatings */}
                {(details.vote_average > 0 || plexRatings?.tmdb) && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img src={tmdbIcon} alt="TMDB" className="w-4 h-4" />
                    </div>
                    <span>
                      {(plexRatings?.tmdb ?? details.vote_average).toFixed(1)}
                    </span>
                  </div>
                )}
                {/* IMDB - from radarrRatings (movies) or plexRatings (shows) */}
                {(isMovie ? radarrRatings?.imdb : plexRatings?.imdb) && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img src={imdbIcon} alt="IMDB" className="w-4 h-4" />
                    </div>
                    <span>
                      {isMovie
                        ? radarrRatings?.imdb?.value.toFixed(1)
                        : plexRatings?.imdb?.rating.toFixed(1)}
                    </span>
                  </div>
                )}
                {/* RT Critic - from plexRatings (both movies and shows) */}
                {plexRatings?.rtCritic != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img
                        src={
                          plexRatings.rtCritic >= 6 ? rtFreshIcon : rtRottenIcon
                        }
                        alt="RT Critics"
                        className="w-4 h-4"
                      />
                    </div>
                    <span>{Math.round(plexRatings.rtCritic * 10)}%</span>
                  </div>
                )}
                {/* RT Audience - from plexRatings (both movies and shows) */}
                {plexRatings?.rtAudience != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img
                        src={
                          plexRatings.rtAudience >= 6
                            ? rtAudFreshIcon
                            : rtAudRottenIcon
                        }
                        alt="RT Audience"
                        className="w-4 h-4"
                      />
                    </div>
                    <span>{Math.round(plexRatings.rtAudience * 10)}%</span>
                  </div>
                )}
                {/* Metacritic - from radarrRatings (movies only) */}
                {isMovie && radarrRatings?.metacritic && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img
                        src={metacriticIcon}
                        alt="Metacritic"
                        className="w-4 h-4"
                      />
                    </div>
                    <span>{Math.round(radarrRatings.metacritic.value)}%</span>
                  </div>
                )}
                {/* Trakt - from radarrRatings (movies only) */}
                {isMovie && radarrRatings?.trakt && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img src={traktIcon} alt="Trakt" className="w-4 h-4" />
                    </div>
                    <span>{Math.round(radarrRatings.trakt.value)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Additional Details */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {/* Movie-specific details */}
              {isMovie && (
                <>
                  {details.original_title &&
                    details.original_title !== title && (
                      <div>
                        <span className="text-muted-foreground">
                          Original Title:
                        </span>{' '}
                        <span className="text-foreground">
                          {details.original_title}
                        </span>
                      </div>
                    )}
                  {details.revenue && details.revenue > 0 && (
                    <div>
                      <span className="text-muted-foreground">Revenue:</span>{' '}
                      <span className="text-foreground">
                        {formatCurrency(details.revenue)}
                      </span>
                    </div>
                  )}
                  {details.budget && details.budget > 0 && (
                    <div>
                      <span className="text-muted-foreground">Budget:</span>{' '}
                      <span className="text-foreground">
                        {formatCurrency(details.budget)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* TV show-specific details */}
              {!isMovie && (
                <>
                  {details.original_name && details.original_name !== title && (
                    <div>
                      <span className="text-muted-foreground">
                        Original Name:
                      </span>{' '}
                      <span className="text-foreground">
                        {details.original_name}
                      </span>
                    </div>
                  )}
                  {details.number_of_seasons && (
                    <div>
                      <span className="text-muted-foreground">Seasons:</span>{' '}
                      <span className="text-foreground">
                        {details.number_of_seasons}
                      </span>
                    </div>
                  )}
                  {details.number_of_episodes && (
                    <div>
                      <span className="text-muted-foreground">Episodes:</span>{' '}
                      <span className="text-foreground">
                        {details.number_of_episodes}
                        {details.number_of_seasons &&
                          details.number_of_seasons > 1 &&
                          ` (avg ${Math.round(details.number_of_episodes / details.number_of_seasons)} per season)`}
                      </span>
                    </div>
                  )}
                  {details.first_air_date && details.last_air_date && (
                    <div>
                      <span className="text-muted-foreground">Aired:</span>{' '}
                      <span className="text-foreground">
                        {new Date(details.first_air_date).getFullYear()}
                        {details.first_air_date !== details.last_air_date &&
                          ` - ${new Date(details.last_air_date).getFullYear()}`}
                      </span>
                    </div>
                  )}
                  {details.networks && details.networks.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Network:</span>{' '}
                      <span className="text-foreground">
                        {details.networks
                          .slice(0, 2)
                          .map((network) => network.name)
                          .join(', ')}
                        {details.networks.length > 2 &&
                          ` and ${details.networks.length - 2} more`}
                      </span>
                    </div>
                  )}
                  {details.type && (
                    <div>
                      <span className="text-muted-foreground">Type:</span>{' '}
                      <span className="text-foreground">{details.type}</span>
                    </div>
                  )}
                </>
              )}

              {/* Common details for both movies and TV shows */}
              {details.status && (
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <span className="text-foreground">{details.status}</span>
                </div>
              )}
              {details.original_language && (
                <div>
                  <span className="text-muted-foreground">Language:</span>{' '}
                  <span className="text-foreground">
                    {formatLanguage(details.original_language)}
                  </span>
                </div>
              )}
              {details.production_countries &&
                details.production_countries.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Country:</span>{' '}
                    <span className="text-foreground">
                      {details.production_countries
                        .map((country) => country.name)
                        .join(', ')}
                    </span>
                  </div>
                )}
              {details.production_companies &&
                details.production_companies.length > 0 && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Studios:</span>{' '}
                    <span className="text-foreground">
                      {details.production_companies
                        .slice(0, 3)
                        .map((company) => company.name)
                        .join(', ')}
                      {details.production_companies.length > 3 &&
                        ` and ${details.production_companies.length - 3} more`}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Overview */}
        {details.overview && (
          <>
            <Separator />
            <div>
              <h5 className="font-medium text-foreground mb-2">Overview</h5>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {details.overview}
              </p>
            </div>
          </>
        )}

        {/* Watch Providers */}

        <Separator />
        <div>
          <div className="flex items-center justify-between mb-2">
            <h5 className="font-medium text-foreground">Where to Watch</h5>
            {/* Region Selector */}
            <TmdbRegionSelector onRegionChange={onRegionChange} />
          </div>

          {watchProviders &&
          ((watchProviders.flatrate?.length ?? 0) > 0 ||
            (watchProviders.rent?.length ?? 0) > 0 ||
            (watchProviders.buy?.length ?? 0) > 0) ? (
            <div className="space-y-3">
              {watchProviders.flatrate &&
                watchProviders.flatrate.length > 0 && (
                  <div>
                    <h6 className="text-sm font-medium text-foreground mb-1">
                      Streaming
                    </h6>
                    <div className="flex flex-wrap gap-2">
                      {watchProviders.flatrate.map((provider) => (
                        <div
                          key={provider.provider_id}
                          className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1"
                        >
                          {provider.logo_path && (
                            <img
                              src={`https://image.tmdb.org/t/p/w45${provider.logo_path}`}
                              alt={provider.provider_name}
                              className="w-4 h-4 rounded"
                            />
                          )}
                          <span className="text-xs font-medium">
                            {provider.provider_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {watchProviders.rent && watchProviders.rent.length > 0 && (
                <div>
                  <h6 className="text-sm font-medium text-foreground mb-1">
                    Rent
                  </h6>
                  <div className="flex flex-wrap gap-2">
                    {watchProviders.rent.map((provider) => (
                      <div
                        key={provider.provider_id}
                        className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1"
                      >
                        {provider.logo_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w45${provider.logo_path}`}
                            alt={provider.provider_name}
                            className="w-4 h-4 rounded"
                          />
                        )}
                        <span className="text-xs font-medium">
                          {provider.provider_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {watchProviders.buy && watchProviders.buy.length > 0 && (
                <div>
                  <h6 className="text-sm font-medium text-foreground mb-1">
                    Buy
                  </h6>
                  <div className="flex flex-wrap gap-2">
                    {watchProviders.buy.map((provider) => (
                      <div
                        key={provider.provider_id}
                        className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1"
                      >
                        {provider.logo_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w45${provider.logo_path}`}
                            alt={provider.provider_name}
                            className="w-4 h-4 rounded"
                          />
                        )}
                        <span className="text-xs font-medium">
                          {provider.provider_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {watchProviders.link && (
                <div className="pt-2">
                  <a
                    href={watchProviders.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View more options on TMDB
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No streaming services available in {config?.tmdbRegion || 'US'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
