import { Trash2, RefreshCw, Loader2, Check } from 'lucide-react'
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
import { useConfigStore } from '@/stores/configStore'
import { usePlexSetup } from '../../hooks/usePlexSetup'
import { usePlexConnection } from '../../hooks/usePlexConnection'
import { usePlexRssFeeds } from '../../hooks/usePlexRssFeeds'
import { usePlexWatchlist } from '../../hooks/usePlexWatchlist'

export default function PlexConnectionSection() {
  // Connection state
  const { form, status, handleUpdateToken, handleRemoveToken } =
    usePlexConnection()

  // RSS feed state
  const { rssStatus, generateRssFeeds } = usePlexRssFeeds()
  const config = useConfigStore((state) => state.config)

  // Watchlist refresh
  const { selfWatchlistStatus, othersWatchlistStatus, refreshWatchlists } =
    usePlexWatchlist()

  // Setup modal trigger
  const { setShowSetupModal } = usePlexSetup()

  return (
    <div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Plex Integration</h2>
      </div>
      <div className="grid gap-4 mt-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleUpdateToken)}
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

            <div className="space-y-4">
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
      </div>
    </div>
  )
}
