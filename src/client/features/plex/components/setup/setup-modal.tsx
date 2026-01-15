import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlexPinAuth } from '@/features/plex/components/setup/plex-pin-auth'
import { usePlexWatchlist } from '@/features/plex/hooks/usePlexWatchlist'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { api } from '@/lib/api'
import { useConfigStore } from '@/stores/configStore'

interface SetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Renders a modal dialog for configuring Plex integration by entering a Plex token and syncing watchlists.
 *
 * Guides the user through entering and validating a Plex token, then manages the syncing of both personal and shared Plex watchlists with progress feedback. The modal prevents closure during submission and displays success or error notifications as appropriate.
 *
 * @param open - Whether the modal is currently open
 * @param onOpenChange - Callback to update the modal's open state
 */
export default function SetupModal({ open, onOpenChange }: SetupModalProps) {
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const refreshRssFeeds = useConfigStore((state) => state.refreshRssFeeds)
  const [plexToken, setPlexToken] = useState('')
  const [currentStep, setCurrentStep] = useState<'token' | 'syncing'>('token')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authMethod, setAuthMethod] = useState<'pin' | 'manual'>('pin')

  const {
    selfWatchlistStatus,
    othersWatchlistStatus,
    setSelfWatchlistStatus,
    setOthersWatchlistStatus,
  } = usePlexWatchlist()

  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  React.useEffect(() => {
    if (
      selfWatchlistStatus === 'success' &&
      othersWatchlistStatus === 'success'
    ) {
      const timer = setTimeout(async () => {
        try {
          await fetchUserData()
          onOpenChange(false)

          setTimeout(() => {
            setCurrentStep('token')
            setIsSubmitting(false)
            setSelfWatchlistStatus('idle')
            setOthersWatchlistStatus('idle')
          }, 150)
        } catch (error) {
          console.error('Error updating final state:', error)
          toast.error('Error finalizing setup')
        }
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [
    selfWatchlistStatus,
    othersWatchlistStatus,
    onOpenChange,
    fetchUserData,
    setSelfWatchlistStatus,
    setOthersWatchlistStatus,
  ])

  useEffect(() => {
    if (open && !isSubmitting) {
      setCurrentStep('token')
      setAuthMethod('pin')
      setPlexToken('')
      setSelfWatchlistStatus('idle')
      setOthersWatchlistStatus('idle')
    }
  }, [open, isSubmitting, setSelfWatchlistStatus, setOthersWatchlistStatus])

  // Shared handler for processing a token (from PIN auth or manual entry)
  const handleTokenReceived = useCallback(
    async (token: string) => {
      setIsSubmitting(true)
      try {
        const tokenMinLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([
          updateConfig({
            plexTokens: [token],
          }),
          tokenMinLoadingTime,
        ])

        const verifyMinLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        const [plexPingResponse] = await Promise.all([
          fetch(api('/v1/plex/ping'), {
            method: 'GET',
          }),
          verifyMinLoadingTime,
        ])

        if (!plexPingResponse.ok) {
          throw new Error('Failed to verify Plex token')
        }

        await plexPingResponse.json()

        setCurrentStep('syncing')

        setSelfWatchlistStatus('loading')
        const selfMinLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        try {
          const [watchlistResponse] = await Promise.all([
            fetch(api('/v1/plex/self-watchlist-token'), {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }),
            selfMinLoadingTime,
          ])

          if (!watchlistResponse.ok) {
            throw new Error('Failed to sync watchlist')
          }
        } catch (syncError) {
          // Network errors (premature close) may occur even when server-side sync completed
          // Log and continue to others sync rather than aborting entirely
          console.warn('Self watchlist sync request error:', syncError)
        }

        setSelfWatchlistStatus('success')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setOthersWatchlistStatus('loading')
        const othersMinLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        try {
          const [othersResponse] = await Promise.all([
            fetch(api('/v1/plex/others-watchlist-token'), {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }),
            othersMinLoadingTime,
          ])

          if (!othersResponse.ok) {
            throw new Error('Failed to sync others watchlist')
          }
        } catch (syncError) {
          // Network errors (premature close) may occur even when server-side sync completed
          console.warn('Others watchlist sync request error:', syncError)
        }

        const rssMinLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([refreshRssFeeds(), rssMinLoadingTime])

        setOthersWatchlistStatus('success')

        toast.success('Plex configuration has been successfully completed')
      } catch (error) {
        console.error('Setup error:', error)
        toast.error(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        )
        setIsSubmitting(false)
        setCurrentStep('token')
        setSelfWatchlistStatus('idle')
        setOthersWatchlistStatus('idle')
        return
      }
    },
    [
      updateConfig,
      setSelfWatchlistStatus,
      setOthersWatchlistStatus,
      refreshRssFeeds,
    ],
  )

  // Handler for manual token submission
  const handleSubmit = () => {
    handleTokenReceived(plexToken)
  }

  // Only allow closing if not submitting
  const handleOpenChange = (newOpen: boolean) => {
    // If trying to close during submission, prevent it
    if (isSubmitting && !newOpen) {
      return
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => {
          // Always prevent closing on outside click
          e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          // Always prevent closing with Escape key
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {!isSubmitting
              ? 'Connect to Plex'
              : currentStep === 'syncing'
                ? 'Setting Up Plex Integration'
                : 'Connect to Plex'}
          </DialogTitle>
          <DialogDescription>
            {!isSubmitting
              ? 'Choose how you want to connect your Plex account.'
              : currentStep === 'syncing'
                ? 'Please wait while we configure your Plex integration...'
                : 'Choose how you want to connect your Plex account.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!isSubmitting ? (
            <Tabs
              value={authMethod}
              onValueChange={(v) => setAuthMethod(v as 'pin' | 'manual')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pin">Login with Plex</TabsTrigger>
                <TabsTrigger value="manual">Enter Token</TabsTrigger>
              </TabsList>
              <TabsContent value="pin">
                {authMethod === 'pin' && (
                  <PlexPinAuth onSuccess={handleTokenReceived} />
                )}
              </TabsContent>
              <TabsContent value="manual">
                <div className="space-y-4 py-4">
                  <Input
                    value={plexToken}
                    onChange={(e) => setPlexToken(e.target.value)}
                    placeholder="Enter your Plex token"
                    type="text"
                    disabled={isSubmitting}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="default"
                      onClick={handleSubmit}
                      disabled={!plexToken || isSubmitting}
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : currentStep === 'syncing' ? (
            <div className="space-y-4">
              {/* Self watchlist progress */}
              {(selfWatchlistStatus === 'loading' ||
                (selfWatchlistStatus === 'success' &&
                  othersWatchlistStatus === 'idle')) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground">
                      {selfWatchlistProgress.message ||
                        'Syncing Your Watchlist'}
                    </span>
                    <span className="text-sm text-foreground">
                      {selfWatchlistProgress.progress}%
                    </span>
                  </div>
                  <Progress value={selfWatchlistProgress.progress} />
                </div>
              )}

              {/* Others watchlist progress */}
              {othersWatchlistStatus === 'loading' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground">
                      {othersWatchlistProgress.message ||
                        "Syncing Others' Watchlists"}
                    </span>
                    <span className="text-sm text-foreground">
                      {othersWatchlistProgress.progress}%
                    </span>
                  </div>
                  <Progress value={othersWatchlistProgress.progress} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
