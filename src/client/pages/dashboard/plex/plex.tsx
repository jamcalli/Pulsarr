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

const plexTokenFormSchema = z.object({
  plexToken: z.string().min(5, { message: 'Plex Token is required' }),
})

type PlexTokenFormSchema = z.infer<typeof plexTokenFormSchema>

export default function PlexConfigPage() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const initialize = useConfigStore((state) => state.initialize)

  // Status states
  const [status, setStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [rssStatus, setRssStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [watchlistStatus, setWatchlistStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [othersWatchlistStatus, setOthersWatchlistStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  // Progress tracking using the store
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  // Data states
  const [rssFeeds, setRssFeeds] = React.useState<{
    self: string
    friends: string
  }>({ self: '', friends: '' })

  const [watchlistCount, setWatchlistCount] = React.useState<number | null>(
    null,
  )
  const [othersWatchlistInfo, setOthersWatchlistInfo] = React.useState<{
    userCount: number
    totalItems: number
  } | null>(null)

  React.useEffect(() => {
    initialize()
  }, [initialize])

  const form = useForm<PlexTokenFormSchema>({
    resolver: zodResolver(plexTokenFormSchema),
    defaultValues: {
      plexToken: config?.plexTokens[0] || '',
    },
  })

  React.useEffect(() => {
    if (config?.plexTokens[0]) {
      form.setValue('plexToken', config.plexTokens[0])
    }
  }, [config, form])

  const generateRssFeeds = async () => {
    setRssStatus('loading')
    try {
      const response = await fetch('/v1/plex/generate-rss-feeds', {
        method: 'GET',
      })
      const result = await response.json()

      if (response.ok && result.self && result.friends) {
        setRssFeeds({
          self: result.self,
          friends: result.friends,
        })
        setRssStatus('success')
        toast({
          title: 'RSS Feeds Generated',
          description: 'RSS feed URLs have been successfully generated',
          variant: 'default',
        })
      } else {
        setRssStatus('error')
        toast({
          title: 'Generation Failed',
          description:
            'Unable to generate RSS feeds. Are you an active Plex Pass user?',
          variant: 'destructive',
        })
      }
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

  const fetchWatchlistCount = async () => {
    setWatchlistStatus('loading')

    try {
      const response = await fetch('/v1/plex/self-watchlist-token', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to sync watchlist')
      }

      const result = await response.json()

      if (result.total != null && result.users?.length > 0) {
        setWatchlistCount(result.total)
        setWatchlistStatus('success') // Set success when API call completes
        toast({
          title: 'Watchlist Synced',
          description: 'Your watchlist has been successfully synced',
          variant: 'default',
        })
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Watchlist sync error:', error)
      setWatchlistStatus('error')
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync watchlist data',
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

      const plexPingResponse = await fetch('/v1/plex/ping', {
        method: 'GET',
      })
      const plexPingResult = await plexPingResponse.json()
      if (plexPingResult.success) {
        setStatus('success')
        toast({
          title: 'Plex Token Configured',
          description: 'Plex token successfully added and verified',
          variant: 'default',
        })
      } else {
        setStatus('error')
        toast({
          title: 'Plex Verification Failed',
          description: 'Unable to verify Plex connection',
          variant: 'destructive',
        })
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

  const fetchOthersWatchlist = async () => {
    setOthersWatchlistStatus('loading')

    try {
      const response = await fetch('/v1/plex/others-watchlist-token', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to sync others watchlist')
      }

      const result = await response.json()
      if (result.total != null && result.users?.length > 0) {
        setOthersWatchlistInfo({
          userCount: result.users.length,
          totalItems: result.total,
        })
        setOthersWatchlistStatus('success')
        toast({
          title: 'Others Watchlist Synced',
          description: 'Others watchlist has been successfully synced',
          variant: 'default',
        })
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Others watchlist sync error:', error)
      setOthersWatchlistStatus('error')
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync others watchlist data',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Top Row - Plex Token and Self Watchlist */}
          <div className="flex portrait:flex-col gap-4">
            {/* Plex Token Section */}
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

            {/* Self Watchlist Section */}
            <div className="flex-1">
              <div className="flex items-end space-x-2">
                <FormItem className="flex-grow">
                  <FormLabel className="text-text">Self Watchlist</FormLabel>
                  {watchlistStatus === 'loading' ? (
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
                          selfWatchlistProgress.isComplete ? 'bg-green-500' : ''
                        }
                      />
                    </div>
                  ) : (
                    <FormControl>
                      <Input
                        value={
                          watchlistCount !== null
                            ? `You have ${watchlistCount} items in your watchlist!`
                            : ''
                        }
                        placeholder="Sync watchlist to view count"
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
                  onClick={fetchWatchlistCount}
                  disabled={watchlistStatus === 'loading'}
                  className="shrink-0"
                >
                  {watchlistStatus === 'loading' ? (
                    <Loader2 className="animate-spin" />
                  ) : watchlistStatus === 'success' ? (
                    <Check className="text-black" />
                  ) : (
                    <RefreshCw />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Others Watchlist Row */}
          <div className="flex items-end space-x-2">
            <FormItem className="flex-grow">
              <FormLabel className="text-text">Others Watchlist</FormLabel>
              {othersWatchlistStatus === 'loading' ? (
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
                      othersWatchlistInfo
                        ? `${othersWatchlistInfo.userCount} users with ${othersWatchlistInfo.totalItems} items total`
                        : ''
                    }
                    placeholder="Sync to view others' watchlists"
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
              onClick={fetchOthersWatchlist}
              disabled={othersWatchlistStatus === 'loading'}
              className="shrink-0"
            >
              {othersWatchlistStatus === 'loading' ? (
                <Loader2 className="animate-spin" />
              ) : othersWatchlistStatus === 'success' ? (
                <Check className="text-black" />
              ) : (
                <RefreshCw />
              )}
            </Button>
          </div>

          {/* RSS Feeds Section */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="noShadow"
              onClick={generateRssFeeds}
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
                    value={rssFeeds.self}
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
                    value={rssFeeds.friends}
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
  )
}
