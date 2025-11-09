import {
  Check,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ServerIcon,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import PlexConnectionSkeleton from '@/features/plex/components/connection/connection-section-skeleton'
import SetupModal from '@/features/plex/components/setup/setup-modal'
import { usePlexConnection } from '@/features/plex/hooks/usePlexConnection'
import { usePlexExistenceCheck } from '@/features/plex/hooks/usePlexExistenceCheck'
import { usePlexRssFeeds } from '@/features/plex/hooks/usePlexRssFeeds'
import { usePlexSetup } from '@/features/plex/hooks/usePlexSetup'
import { usePlexWatchlist } from '@/features/plex/hooks/usePlexWatchlist'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { usePlexServerDiscovery } from '@/features/utilities/hooks/usePlexServerDiscovery'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { useConfigStore } from '@/stores/configStore'

/**
 * Displays the Plex Configuration page, allowing users to manage Plex integration settings.
 *
 * Provides an interface for configuring Plex tokens, generating RSS feeds, refreshing watchlist data, and viewing watchlist statistics for the current user and others. Includes responsive layout, loading skeletons, and visual feedback for asynchronous actions.
 */
export default function PlexConfigurationPage() {
  const config = useConfigStore((state) => state.config)
  const initialize = useConfigStore((state) => state.initialize)
  const { showSetupModal, setShowSetupModal } = usePlexSetup()

  // Initialize store on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Check if Plex token is missing and show setup modal
  useEffect(() => {
    if (config && (!config.plexTokens || config.plexTokens.length === 0)) {
      setShowSetupModal(true)
    }
  }, [config, setShowSetupModal])

  // Connection state
  const { form, status, handleUpdateToken, handleRemoveToken } =
    usePlexConnection()

  // Server discovery state
  const { isDiscovering, servers, discoverServers } = usePlexServerDiscovery()
  const [showServerCards, setShowServerCards] = useState(false)

  // Show server cards when servers are discovered
  useEffect(() => {
    if (servers.length > 0) {
      setShowServerCards(true)
    }
  }, [servers])

  // Existence check state
  const {
    form: existenceCheckForm,
    isSaving: isExistenceCheckSaving,
    onSubmit: onExistenceCheckSubmit,
    handleCancel: handleExistenceCheckCancel,
  } = usePlexExistenceCheck()

  // Media query for mobile/desktop
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)

  // RSS feed state
  const { rssStatus, generateRssFeeds } = usePlexRssFeeds()
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
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <PlexConnectionSkeleton />
      </div>
    )
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <SetupModal open={showSetupModal} onOpenChange={setShowSetupModal} />

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Plex Integration</h2>
      </div>
      <div className="grid gap-4">
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

        {/* Plex Existence Check Configuration */}
        <Separator className="my-6" />
        <Form {...existenceCheckForm}>
          <form
            onSubmit={existenceCheckForm.handleSubmit(onExistenceCheckSubmit)}
            className="space-y-4"
          >
            <div
              className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}
            >
              {/* Toggle */}
              <FormField
                control={existenceCheckForm.control}
                name="skipIfExistsOnPlex"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Skip downloading if content exists on Plex
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              When enabled, Pulsarr will check all accessible
                              Plex servers (using your primary token) and skip
                              downloading content that already exists, even if
                              it's not in Sonarr/Radarr. This prevents duplicate
                              downloads across multiple servers. For your owned
                              server, the configured Server Connection will be
                              used; shared servers use auto-discovery.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Server Connection */}
              <FormField
                control={existenceCheckForm.control}
                name="plexServerUrl"
                render={({ field }) => {
                  const defaultUrl = 'http://localhost:32400'
                  // Display empty input when value is the default URL or empty string
                  // Backend treats both identically as "use auto-discovery"
                  const displayValue =
                    field.value === defaultUrl ? '' : field.value || ''

                  return (
                    <FormItem>
                      <div className="flex items-center">
                        <FormLabel className="text-foreground m-0">
                          Server Connection (Optional)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Specify which connection method to use for all
                                Plex server communication (session monitoring,
                                label sync, content existence checks, etc.). Use
                                "Find Server" to discover and select from
                                available connection options, or leave empty to
                                attempt auto-negotiation.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex space-x-2 mt-2">
                        <FormControl>
                          <Input
                            {...field}
                            value={displayValue}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="Leave empty to auto-negotiate"
                            className="flex-1"
                            disabled={isExistenceCheckSaving}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="noShadow"
                          onClick={() => {
                            const token = config?.plexTokens?.[0]
                            if (token) {
                              discoverServers(token)
                            }
                          }}
                          disabled={isDiscovering || !config?.plexTokens?.[0]}
                        >
                          {isDiscovering ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Search className="h-4 w-4 mr-2" />
                          )}
                          Find Server
                        </Button>
                      </div>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )
                }}
              />
            </div>

            {/* Server Selection Cards */}
            {showServerCards && servers.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {servers.map((server, index) => (
                  <Card
                    key={`${server.host}-${server.port}-${index}`}
                    className="cursor-pointer hover:border-primary transition-colors flex flex-col"
                  >
                    <CardHeader className="py-3 px-4 pb-2">
                      <CardTitle className="text-base flex items-center">
                        <ServerIcon className="h-4 w-4 mr-2 text-primary" />
                        {server.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {server.local
                          ? 'Local Connection'
                          : 'Remote Connection'}
                        {server.useSsl && ' • Secure'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="py-2 px-4 text-xs">
                      <div className="flex items-center space-x-1">
                        <span className="font-medium">Host:</span>
                        <span>{server.host}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium">Port:</span>
                        <span>{server.port}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium">SSL:</span>
                        <span>{server.useSsl ? 'Yes' : 'No'}</span>
                      </div>
                    </CardContent>
                    <div className="mt-auto px-4 pb-3">
                      <Button
                        type="button"
                        variant="blue"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const url = `${server.useSsl ? 'https' : 'http'}://${server.host}:${server.port}`
                          existenceCheckForm.setValue('plexServerUrl', url, {
                            shouldDirty: true,
                          })
                          setShowServerCards(false)
                        }}
                      >
                        Select
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Save/Cancel buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              {existenceCheckForm.formState.isDirty &&
                !isExistenceCheckSaving && (
                  <Button
                    type="button"
                    variant="cancel"
                    onClick={handleExistenceCheckCancel}
                    disabled={isExistenceCheckSaving}
                    className="flex items-center gap-1"
                  >
                    <X className="h-4 w-4" />
                    <span>Cancel</span>
                  </Button>
                )}

              <Button
                type="submit"
                disabled={
                  isExistenceCheckSaving ||
                  !existenceCheckForm.formState.isDirty
                }
                className="flex items-center gap-2"
                variant="blue"
              >
                {isExistenceCheckSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>
                  {isExistenceCheckSaving ? 'Saving...' : 'Save Changes'}
                </span>
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
