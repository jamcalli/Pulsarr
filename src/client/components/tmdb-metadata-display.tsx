import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Clock, Tv, Film, ExternalLink, Globe } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { useState, useEffect } from 'react'
import type {
  TmdbMetadataSuccessResponse,
  TmdbRegion,
  TmdbRegionsSuccessResponse,
} from '@root/schemas/tmdb/tmdb.schema'

// Import local rating service icons
import imdbIcon from '@/assets/images/rating-icons/imdb.svg'
import tmdbIcon from '@/assets/images/rating-icons/tmdb.svg'
import metacriticIcon from '@/assets/images/rating-icons/metacritic.svg'
import rottenTomatoesIcon from '@/assets/images/rating-icons/rotten-tomatoes.svg'
import traktIcon from '@/assets/images/rating-icons/trakt.svg'

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
  const { config, updateConfig } = useConfigStore()
  const [availableRegions, setAvailableRegions] = useState<TmdbRegion[]>([])
  const [loadingRegions, setLoadingRegions] = useState(false)

  // Fetch available regions on component mount
  useEffect(() => {
    const fetchRegions = async () => {
      if (availableRegions.length > 0) return // Already loaded

      setLoadingRegions(true)
      try {
        const response = await fetch('/v1/tmdb/regions')
        const data: TmdbRegionsSuccessResponse = await response.json()

        if (data.success && data.regions) {
          const sortedRegions = data.regions.sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          setAvailableRegions(sortedRegions)
        }
      } catch (error) {
        console.error('Failed to fetch TMDB regions:', error)
      } finally {
        setLoadingRegions(false)
      }
    }

    fetchRegions()
  }, [availableRegions.length])

  // Handle region change
  const handleRegionChange = async (newRegion: string) => {
    if (!config) return

    try {
      await updateConfig({ tmdbRegion: newRegion })
      // Refetch metadata with new region if callback provided
      if (onRegionChange) {
        await onRegionChange()
      }
    } catch (error) {
      console.error('Failed to update TMDB region:', error)
    }
  }

  // Get current region info for display
  const currentRegion = availableRegions.find(
    (region) => region.code === (config?.tmdbRegion || 'US'),
  )
  const currentRegionName = currentRegion?.name || 'United States'

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
    <div className="relative">
      {/* Backdrop Image */}
      {backdropUrl && (
        <div className="absolute inset-0 -z-10 overflow-hidden rounded-lg">
          <img
            src={backdropUrl}
            alt={`${title} backdrop`}
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
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

            {/* Ratings - Simplified inline display */}
            {(radarrRatings || details.vote_average > 0) && isMovie && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {details.vote_average > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img src={tmdbIcon} alt="TMDB" className="w-4 h-4" />
                    </div>
                    <span>{details.vote_average.toFixed(1)}</span>
                  </div>
                )}
                {radarrRatings?.imdb && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img src={imdbIcon} alt="IMDB" className="w-4 h-4" />
                    </div>
                    <span>{radarrRatings.imdb.value.toFixed(1)}</span>
                  </div>
                )}
                {radarrRatings?.rottenTomatoes && (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-secondary-background rounded">
                      <img
                        src={rottenTomatoesIcon}
                        alt="Rotten Tomatoes"
                        className="w-4 h-4"
                      />
                    </div>
                    <span>
                      {Math.round(radarrRatings.rottenTomatoes.value)}%
                    </span>
                  </div>
                )}
                {radarrRatings?.metacritic && (
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
                {radarrRatings?.trakt && (
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
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="font-medium text-foreground">Where to Watch</h5>
              {/* Region Selector */}
              {availableRegions.length > 0 && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <Select
                    value={config?.tmdbRegion || 'US'}
                    onValueChange={handleRegionChange}
                    disabled={loadingRegions}
                  >
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue
                        placeholder={
                          loadingRegions ? 'Loading...' : currentRegionName
                        }
                      />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {availableRegions.map((region) => (
                        <SelectItem key={region.code} value={region.code}>
                          {region.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                No streaming services available in {currentRegionName}
              </div>
            )}
          </div>
        </>
      </div>
    </div>
  )
}
