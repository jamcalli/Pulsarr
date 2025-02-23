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
  const [selfWatchlistStatus, setSelfWatchlistStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [othersWatchlistStatus, setOthersWatchlistStatus] = React.useState<
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
    try {
      // Start both watchlist syncs without waiting between them
      setSelfWatchlistStatus('loading')
      setOthersWatchlistStatus('loading')

      await Promise.all([
        fetch('/v1/plex/self-watchlist-token'),
        fetch('/v1/plex/others-watchlist-token'),
      ])

      // After both are complete, update status and refresh state
      setSelfWatchlistStatus('success')
      setOthersWatchlistStatus('success')
      await fetchUserData()

      toast({
        title: 'Watchlists Refreshed',
        description: 'Watchlist data has been updated',
        variant: 'default',
      })
    } catch (error) {
      setSelfWatchlistStatus('error')
      setOthersWatchlistStatus('error')
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
      setStatus('success')
    } catch (error) {
      console.error('Token update error:', error)
      setStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to update token',
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
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <PlexSetupModal
          open={showSetupModal}
          onOpenChange={setShowSetupModal}
        />
        <div className="grid gap-6">
          <div>
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-text">Plex Integration</h2>
            </div>
            <div className="grid gap-4 mt-4">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-8"
                >
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
                            type="button"
                            size="icon"
                            variant="error"
                            onClick={handleRemoveToken}
                            disabled={
                              status === 'loading' ||
                              !form.getValues('plexToken')
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
                        onClick={handleGenerateRssFeeds}
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
                        onClick={handleRefreshWatchlists}
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

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <FormItem className="flex-grow">
                        <FormLabel className="text-text">
                          Self Watchlist
                        </FormLabel>
                        {selfWatchlistStatus === 'loading' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-text">
                                {selfWatchlistProgress.message ||
                                  'Processing...'}
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

                    <div className="flex-1">
                      <FormItem className="flex-grow">
                        <FormLabel className="text-text">
                          Others Watchlist
                        </FormLabel>
                        {othersWatchlistStatus === 'loading' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-text">
                                {othersWatchlistProgress.message ||
                                  'Processing...'}
                              </span>
                              <span className="text-sm text-text">
                                {othersWatchlistProgress.progress}%
                              </span>
                            </div>
                            <Progress
                              value={othersWatchlistProgress.progress}
                              className={
                                othersWatchlistProgress.isComplete
                                  ? 'bg-green-500'
                                  : ''
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
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex portrait:flex-col gap-4">
                      <FormItem className="flex-1">
                        <FormLabel className="text-text text-sm">
                          Self Feed
                        </FormLabel>
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
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
            </div>
            <div className="grid gap-4 mt-4">
              {users ? (
                <WatchlistTable users={users} />
              ) : (
                <div className="text-center py-8 text-text text-muted-foreground">
                  No watchlist data available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}
