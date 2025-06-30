import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useConfigStore } from '@/stores/configStore'
import { usePlexSetup } from '@/features/plex/hooks/usePlexSetup'
import { usePlexConnection } from '@/features/plex/hooks/usePlexConnection'
import { usePlexRssFeeds } from '@/features/plex/hooks/usePlexRssFeeds'
import { usePlexWatchlist } from '@/features/plex/hooks/usePlexWatchlist'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { useMediaQuery } from '@/hooks/use-media-query'
import PlexConnectionSkeleton from '@/features/plex/components/connection/connection-section-skeleton'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

/**
 * Renders the Plex integration UI for managing connection credentials, watchlist statistics, and RSS feed generation.
 *
 * This component displays a form enabling users to update or remove their Plex token, refresh watchlist data, and generate RSS feeds.
 * It manages loading state with a minimum delay and conditionally renders a skeleton until initialization is complete.
 * Responsive design adjustments ensure proper layout on mobile devices.
 *
 * @returns The Plex connection section component.
 */
export default function PlexConnectionSection() {
  // Connection state
  const { form, status, handleUpdateToken, handleRemoveToken } =
    usePlexConnection()

  // Media query for mobile/desktop
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)

  // RSS feed state
  const { rssStatus, generateRssFeeds } = usePlexRssFeeds()
  const config = useConfigStore((state) => state.config)
  const isInitialized = useConfigStore((state) => state.isInitialized)

  // Get user data to compute watchlist counts
  const users = useConfigStore((state) => state.users)
  const selfWatchlist = users?.find((user) => Number(user.id) === 1)
  const otherUsers = users?.filter((user) => Number(user.id) !== 1) || []
  const othersTotal = otherUsers.reduce(
    (acc, user) => acc + (user.watchlist_count || 0),
    0,
  )

  // Watchlist refresh
  const { selfWatchlistStatus, othersWatchlistStatus, refreshWatchlists } =
    usePlexWatchlist()

  // Progress hooks for live updates
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  // Setup modal trigger
  const { setShowSetupModal } = usePlexSetup()

  // Setup minimum loading time
  useEffect(() => {
    let isMounted = true

    const timer = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true)
        if (isInitialized) {
          setIsLoading(false)
        }
      }
    }, MIN_LOADING_DELAY)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isInitialized])

  // Update loading state when initialized
  useEffect(() => {
    if (isInitialized && minLoadingComplete) {
      setIsLoading(false)
    }
  }, [isInitialized, minLoadingComplete])

  // Show skeleton during loading
  if (isLoading) {
    return <PlexConnectionSkeleton />
  }

  return (
    <div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Plex Integration</h2>
      </div>
      <div className="grid gap-4 mt-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleUpdateToken)}
            className="space-y-8"
          >
            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
              <div className="flex-1">
                <div className="flex items-end space-x-2">
                  <FormField
                    control={form.control}
                    name="plexToken"
                    render={({ field }) => (
                      <FormItem className="grow">
                        <FormLabel className="text-foreground">
                          Primary Plex Token
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter Plex Token"
                            type="text"
                            disabled={status === 'loading'}
                            className="w-full"
                            onClick={() => {
                              if (!field.value) {
                                setShowSetupModal(true)
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage className="text-xs mt-1" />
                      </FormItem>
                    )}
                  />
                  <div className="flex space-x-2 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="error"
                      onClick={handleRemoveToken}
                      disabled={
                        status === 'loading' || !form.getValues('plexToken')
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 shrink-0">
                <Button
                  type="button"
                  variant="noShadow"
                  onClick={generateRssFeeds}
                  disabled={rssStatus === 'loading'}
                  className="shrink-0 flex items-center gap-2"
                >
                  {rssStatus === 'loading' ? (
                    <Loader2 className="animate-spin" />
                  ) : rssStatus === 'success' ? (
                    <Check className="text-black" />
                  ) : (
                    <RefreshCw />
                  )}
                  Generate RSS
                </Button>

                <Button
                  type="button"
                  variant="noShadow"
                  onClick={refreshWatchlists}
                  disabled={
                    selfWatchlistStatus === 'loading' ||
                    othersWatchlistStatus === 'loading'
                  }
                  className="shrink-0 flex items-center gap-2"
                >
                  {selfWatchlistStatus === 'loading' ||
                  othersWatchlistStatus === 'loading' ? (
                    <Loader2 className="animate-spin" />
                  ) : selfWatchlistStatus === 'success' &&
                    othersWatchlistStatus === 'success' ? (
                    <Check className="text-black" />
                  ) : (
                    <RefreshCw />
                  )}
                  Manual refresh
                </Button>
              </div>
            </div>

            {/* Watchlist stats section */}
            <div className="flex gap-4">
              <div className="flex-1">
                <FormItem className="grow">
                  <FormLabel className="text-foreground">
                    Self Watchlist
                  </FormLabel>
                  {selfWatchlistStatus === 'loading' ? (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-foreground">
                          {selfWatchlistProgress.message || 'Processing...'}
                        </span>
                        <span className="text-sm text-foreground">
                          {selfWatchlistProgress.progress}%
                        </span>
                      </div>
                      <Progress value={selfWatchlistProgress.progress} />
                    </div>
                  ) : (
                    <FormControl>
                      <Input
                        value={
                          selfWatchlist?.watchlist_count !== undefined
                            ? `You have ${selfWatchlist.watchlist_count.toLocaleString()} items in your watchlist!`
                            : ''
                        }
                        placeholder="No watchlist data available"
                        type="text"
                        readOnly
                        className="w-full"
                      />
                    </FormControl>
                  )}
                </FormItem>
              </div>

              <div className="flex-1">
                <FormItem className="grow">
                  <FormLabel className="text-foreground">
                    Others Watchlist
                  </FormLabel>
                  {othersWatchlistStatus === 'loading' ? (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-foreground">
                          {othersWatchlistProgress.message || 'Processing...'}
                        </span>
                        <span className="text-sm text-foreground">
                          {othersWatchlistProgress.progress}%
                        </span>
                      </div>
                      <Progress value={othersWatchlistProgress.progress} />
                    </div>
                  ) : (
                    <FormControl>
                      <Input
                        value={
                          otherUsers.length > 0
                            ? `${otherUsers.length.toLocaleString()} users with ${othersTotal.toLocaleString()} items total`
                            : ''
                        }
                        placeholder="No other watchlists available"
                        type="text"
                        readOnly
                        className="w-full"
                      />
                    </FormControl>
                  )}
                </FormItem>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}
              >
                <FormItem className="flex-1">
                  <FormLabel className="text-foreground text-sm">
                    Self Feed
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={
                        config?.selfRss
                          ? config.selfRss
                          : 'RSS feeds are unavailable. This feature requires Plex Pass.'
                      }
                      placeholder="Generate RSS feeds to view URL"
                      type="text"
                      readOnly
                      disabled={!config?.selfRss}
                      className={`w-full ${!config?.selfRss ? 'cursor-not-allowed' : ''}`}
                    />
                  </FormControl>
                </FormItem>

                <FormItem className="flex-1">
                  <FormLabel className="text-foreground text-sm">
                    Friends Feed
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={
                        config?.friendsRss
                          ? config.friendsRss
                          : 'RSS feeds are unavailable. This feature requires Plex Pass.'
                      }
                      placeholder="Generate RSS feeds to view URL"
                      type="text"
                      readOnly
                      disabled={!config?.friendsRss}
                      className={`w-full ${!config?.friendsRss ? 'cursor-not-allowed' : ''}`}
                    />
                  </FormControl>
                </FormItem>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
