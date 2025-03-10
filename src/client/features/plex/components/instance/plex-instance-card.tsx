import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form } from '@/components/ui/form'
import { Progress } from '@/components/ui/progress'
import { FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { RefreshCw, Loader2, Check } from 'lucide-react'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { usePlexConnection } from '@/features/plex/hooks/instance/usePlexConnection'
import { usePlexSync } from '@/features/plex/hooks/instance/usePlexSync'
import { PlexConnectionSettings } from '@/features/plex/components/instance/plex-connection-settings'
import { PlexSetupModal } from '@/features/plex/components/instance/plex-setup-modal'
import { usePlexStore } from '@/features/plex/store/plexStore'
import { useForm } from 'react-hook-form'

export function PlexInstanceCard() {
  const [showSetupModal, setShowSetupModal] = React.useState(false)
  
  // Get data from store
  const config = usePlexStore((state) => state.config)
  const selfWatchlistInfo = usePlexStore((state) => state.selfWatchlistInfo)
  const othersWatchlistInfo = usePlexStore((state) => state.othersWatchlistInfo)
  const rssFeeds = usePlexStore((state) => state.rssFeeds)
  
  // Use connection and sync hooks
  const {
    testStatus,
    saveStatus,
    testPlexToken,
    savePlexToken,
    removePlexToken,
  } = usePlexConnection()
  
  const {
    selfWatchlistStatus,
    othersWatchlistStatus,
    rssStatus,
    handleRefreshSelfWatchlist,
    handleRefreshOthersWatchlist,
    handleGenerateRssFeeds,
  } = usePlexSync()

  // Get progress updates
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')
  
  // Handle showing setup modal when no token is configured
  React.useEffect(() => {
    if (config && (!config.plexTokens || config.plexTokens.length === 0)) {
      setShowSetupModal(true)
    }
  }, [config])
  
  // Handle token test
  const handleTestToken = async (token: string) => {
    await testPlexToken(token)
  }
  
  // Handle token save
  const handleSaveToken = async (token: string) => {
    await savePlexToken(token)
  }
  
  // Handle token removal
  const handleRemoveToken = async () => {
    await removePlexToken()
  }

  const displayForm = useForm();
  
  return (
    <>
      <PlexSetupModal 
        open={showSetupModal} 
        onOpenChange={setShowSetupModal} 
      />
      
      <Card className="bg-bg">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Plex Connection</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plex Token Section */}
          <PlexConnectionSettings
            plexToken={config?.plexTokens?.[0]}
            testStatus={testStatus}
            saveStatus={saveStatus}
            onTest={handleTestToken}
            onSave={handleSaveToken}
            onRemove={handleRemoveToken}
          />
            <Form {...displayForm}>
          {/* Watchlist Information Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormItem>
              <FormLabel className="text-text">
                Self Watchlist
              </FormLabel>
              {selfWatchlistStatus === 'loading' ? (
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text">
                      {selfWatchlistProgress.message || 'Processing...'}
                    </span>
                    <span className="text-sm text-text">
                      {selfWatchlistProgress.progress}%
                    </span>
                  </div>
                  <Progress value={selfWatchlistProgress.progress} />
                </div>
              ) : (
                <FormControl>
                  <div className="flex space-x-2">
                    <Input
                      value={
                        selfWatchlistInfo?.watchlist_count !== undefined
                          ? `You have ${selfWatchlistInfo.watchlist_count.toLocaleString()} items in your watchlist`
                          : 'No watchlist data available'
                      }
                      placeholder="No watchlist data available"
                      type="text"
                      readOnly
                      className="w-full"
                    />
                    <Button
                      type="button"
                      variant="noShadow"
                      onClick={handleRefreshSelfWatchlist}
                      disabled={selfWatchlistStatus === 'loading'}
                      className="shrink-0"
                    >
                      {selfWatchlistStatus === 'loading' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : selfWatchlistStatus === 'success' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
              )}
            </FormItem>

            <FormItem>
              <FormLabel className="text-text">
                Others Watchlist
              </FormLabel>
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
                  <Progress value={othersWatchlistProgress.progress} />
                </div>
              ) : (
                <FormControl>
                  <div className="flex space-x-2">
                    <Input
                      value={
                        othersWatchlistInfo
                          ? `${othersWatchlistInfo.users.length.toLocaleString()} users with ${othersWatchlistInfo.totalCount.toLocaleString()} items total`
                          : 'No other watchlists available'
                      }
                      placeholder="No other watchlists available"
                      type="text"
                      readOnly
                      className="w-full"
                    />
                    <Button
                      type="button"
                      variant="noShadow"
                      onClick={handleRefreshOthersWatchlist}
                      disabled={othersWatchlistStatus === 'loading'}
                      className="shrink-0"
                    >
                      {othersWatchlistStatus === 'loading' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : othersWatchlistStatus === 'success' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
              )}
            </FormItem>
          </div>

          {/* RSS Feeds Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-text">RSS Feeds</h3>
              <Button
                type="button"
                variant="noShadow"
                onClick={handleGenerateRssFeeds}
                disabled={rssStatus === 'loading'}
                className="h-8 text-sm"
              >
                {rssStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : rssStatus === 'success' ? (
                  <Check className="h-4 w-4 mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Generate RSS
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel className="text-text text-sm">
                  Self Feed
                </FormLabel>
                <FormControl>
                  <Input
                    value={rssFeeds.selfRss || ''}
                    placeholder="Generate RSS feeds to view URL"
                    type="text"
                    readOnly
                    className="w-full"
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel className="text-text text-sm">
                  Friends Feed
                </FormLabel>
                <FormControl>
                  <Input
                    value={rssFeeds.friendsRss || ''}
                    placeholder="Generate RSS feeds to view URL"
                    type="text"
                    readOnly
                    className="w-full"
                  />
                </FormControl>
              </FormItem>
            </div>
          </div>
          </Form>
        </CardContent>
      </Card>
    </>
  )
}