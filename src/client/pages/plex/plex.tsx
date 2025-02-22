import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { PlexSetupModal } from '@/pages/plex/plex-setup-modal'
import { WatchlistTable } from '@/pages/plex/plex-user-table'
import { ScrollArea } from '@/components/ui/scroll-area'

const plexTokenFormSchema = z.object({
  plexToken: z.string().min(5, { message: 'Plex Token is required' }),
})

type PlexTokenFormSchema = z.infer<typeof plexTokenFormSchema>

export default function PlexConfigPage() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const initialize = useConfigStore((state) => state.initialize)
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const getSelfWatchlistInfo = useConfigStore(
    (state) => state.getSelfWatchlistInfo,
  )
  const getOthersWatchlistInfo = useConfigStore(
    (state) => state.getOthersWatchlistInfo,
  )
  const users = useConfigStore((state) => state.users)

  const refreshRssFeeds = useConfigStore((state) => state.refreshRssFeeds)

  const [showSetupModal, setShowSetupModal] = React.useState(false)
  const [isInitialized, setIsInitialized] = React.useState(false)
  const [status, setStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [rssStatus, setRssStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [refreshStatus, setRefreshStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  // Get watchlist data from store
  const selfWatchlist = getSelfWatchlistInfo()
  const othersWatchlist = getOthersWatchlistInfo()

  React.useEffect(() => {
    initialize()
  }, [initialize])

  React.useEffect(() => {
    if (config && (!config.plexTokens || config.plexTokens.length === 0)) {
      setShowSetupModal(true)
    }
  }, [config])

  const form = useForm<PlexTokenFormSchema>({
    resolver: zodResolver(plexTokenFormSchema),
    defaultValues: {
      plexToken: '',
    },
  })

  React.useEffect(() => {
    if (config) {
      const token = config.plexTokens?.[0] || ''
      form.setValue('plexToken', token)
      setIsInitialized(true)
    }
  }, [config, form])

  // Only check for showing modal after initialization
  React.useEffect(() => {
    if (
      isInitialized &&
      config &&
      (!config.plexTokens || config.plexTokens.length === 0)
    ) {
      setShowSetupModal(true)
    } else if (config?.plexTokens && config.plexTokens.length > 0) {
      fetchUserData()
    }
  }, [config, fetchUserData, isInitialized])

  const handleRefreshWatchlists = async () => {
    setRefreshStatus('loading')
    try {
      await fetchUserData()
      setRefreshStatus('success')
      toast({
        title: 'Watchlists Refreshed',
        description: 'Watchlist data has been updated',
        variant: 'default',
      })
    } catch (error) {
      setRefreshStatus('error')
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh watchlist data',
        variant: 'destructive',
      })
    }
  }

  const handleGenerateRssFeeds = async () => {
    setRssStatus('loading')
    try {
      await refreshRssFeeds()
      setRssStatus('success')
      toast({
        title: 'RSS Feeds Generated',
        description: 'RSS feed URLs have been successfully generated',
        variant: 'default',
      })
    } catch (error) {
      console.error('RSS generation error:', error)
      setRssStatus('error')
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate RSS feed URLs',
        variant: 'destructive',
      })
    }
  }

  const onSubmit = async (data: PlexTokenFormSchema) => {
    setStatus('loading')
    try {
      await updateConfig({
        plexTokens: [data.plexToken],
      })

      const plexPingResponse = await fetch('/v1/plex/ping')
      const plexPingResult = await plexPingResponse.json()

      if (plexPingResult.success) {
        setStatus('success')
        toast({
          title: 'Plex Token Configured',
          description: 'Plex token successfully added and verified',
          variant: 'default',
        })
      } else {
        throw new Error('Failed to verify Plex connection')
      }
    } catch (error) {
      console.error('Token submission error:', error)
      setStatus('error')
      toast({
        title: 'Connection Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveToken = async () => {
    setStatus('loading')
    try {
      await updateConfig({
        plexTokens: [],
      })
      form.reset()
      setStatus('idle')
      toast({
        title: 'Token Removed',
        description: 'Plex token has been removed',
        variant: 'default',
      })
    } catch (error) {
      setStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to remove token',
        variant: 'destructive',
      })
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <PlexSetupModal
          open={showSetupModal}
          onOpenChange={setShowSetupModal}
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="flex portrait:flex-col gap-4">
              <div className="flex-1">
                <div className="flex items-end space-x-2">
                  <FormField
                    control={form.control}
                    name="plexToken"
                    render={({ field }) => (
                      <FormItem className="flex-grow">
                        <FormLabel className="text-text">
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
                      type="submit"
                      size="icon"
                      variant="noShadow"
                      disabled={status === 'loading' || !form.formState.isValid}
                    >
                      {status === 'loading' ? (
                        <Loader2 className="animate-spin" />
                      ) : status === 'success' ? (
                        <Check className="text-black" />
                      ) : (
                        <Check />
                      )}
                    </Button>
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

              <div className="flex-1">
                <div className="flex items-end space-x-2">
                  <FormItem className="flex-grow">
                    <FormLabel className="text-text">Self Watchlist</FormLabel>
                    {refreshStatus === 'loading' ? (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-text">
                            {selfWatchlistProgress.message || 'Processing...'}
                          </span>
                          <span className="text-sm text-text">
                            {selfWatchlistProgress.progress}%
                          </span>
                        </div>
                        <Progress
                          value={selfWatchlistProgress.progress}
                          className={
                            selfWatchlistProgress.isComplete
                              ? 'bg-green-500'
                              : ''
                          }
                        />
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
              </div>
            </div>

            <div className="flex items-end space-x-2">
              <FormItem className="flex-grow">
                <FormLabel className="text-text">Others Watchlist</FormLabel>
                {refreshStatus === 'loading' ? (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-text">
                        {othersWatchlistProgress.message || 'Processing...'}
                      </span>
                      <span className="text-sm text-text">
                        {othersWatchlistProgress.progress}%
                      </span>
                    </div>
                    <Progress
                      value={othersWatchlistProgress.progress}
                      className={
                        othersWatchlistProgress.isComplete ? 'bg-green-500' : ''
                      }
                    />
                  </div>
                ) : (
                  <FormControl>
                    <Input
                      value={
                        othersWatchlist
                          ? `${othersWatchlist.users.length.toLocaleString()} users with ${othersWatchlist.totalCount.toLocaleString()} items total`
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
              <Button
                type="button"
                size="icon"
                variant="noShadow"
                onClick={handleRefreshWatchlists}
                disabled={refreshStatus === 'loading'}
                className="shrink-0"
              >
                {refreshStatus === 'loading' ? (
                  <Loader2 className="animate-spin" />
                ) : refreshStatus === 'success' ? (
                  <Check className="text-black" />
                ) : (
                  <RefreshCw />
                )}
              </Button>
            </div>

            <div className="space-y-4">
              <Button
                type="button"
                variant="noShadow"
                onClick={handleGenerateRssFeeds}
                disabled={rssStatus === 'loading'}
                className="shrink-0"
              >
                {rssStatus === 'loading' ? (
                  <Loader2 className="animate-spin mr-2" />
                ) : rssStatus === 'success' ? (
                  <Check className="text-black mr-2" />
                ) : (
                  <RefreshCw className="mr-2" />
                )}
                Generate RSS Feeds
              </Button>

              <div className="flex portrait:flex-col gap-4">
                <FormItem className="flex-1">
                  <FormLabel className="text-text text-sm">Self Feed</FormLabel>
                  <FormControl>
                    <Input
                      value={config?.selfRss || ''}
                      placeholder="Generate RSS feeds to view URL"
                      type="text"
                      readOnly
                      className="w-full"
                    />
                  </FormControl>
                </FormItem>

                <FormItem className="flex-1">
                  <FormLabel className="text-text text-sm">
                    Friends Feed
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={config?.friendsRss || ''}
                      placeholder="Generate RSS feeds to view URL"
                      type="text"
                      readOnly
                      className="w-full"
                    />
                  </FormControl>
                </FormItem>
              </div>
            </div>
          </form>
        </Form>

        <div className="my-6" />
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
        </div>

        {users ? (
          <WatchlistTable users={users} />
        ) : (
          <div className="text-center py-8 text-text text-muted-foreground">
            No watchlist data available
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
