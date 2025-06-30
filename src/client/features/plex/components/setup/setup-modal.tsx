import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { usePlexWatchlist } from '@/features/plex/hooks/usePlexWatchlist'

interface SetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Displays a modal dialog for setting up Plex integration by entering a Plex token and syncing watchlists.
 *
 * Guides the user through entering their Plex token, validates the token, and manages the syncing of both personal and shared Plex watchlists. Progress is displayed for each sync step, and the modal prevents closure during submission. Success and error notifications are shown as appropriate.
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
      setSelfWatchlistStatus('idle')
      setOthersWatchlistStatus('idle')
    }
  }, [open, isSubmitting, setSelfWatchlistStatus, setOthersWatchlistStatus])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const tokenMinLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      await Promise.all([
        updateConfig({
          plexTokens: [plexToken],
        }),
        tokenMinLoadingTime,
      ])

      const verifyMinLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const [plexPingResponse] = await Promise.all([
        fetch('/v1/plex/ping', {
          method: 'GET',
        }),
        verifyMinLoadingTime,
      ])

      const plexPingResult = await plexPingResponse.json()

      if (!plexPingResult.success) {
        throw new Error('Invalid Plex token')
      }

      setCurrentStep('syncing')

      setSelfWatchlistStatus('loading')
      const selfMinLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const [watchlistResponse] = await Promise.all([
        fetch('/v1/plex/self-watchlist-token', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
        selfMinLoadingTime,
      ])

      if (!watchlistResponse.ok) {
        throw new Error('Failed to sync watchlist')
      }

      setSelfWatchlistStatus('success')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      setOthersWatchlistStatus('loading')
      const othersMinLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const [othersResponse] = await Promise.all([
        fetch('/v1/plex/others-watchlist-token', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
        othersMinLoadingTime,
      ])

      if (!othersResponse.ok) {
        throw new Error('Failed to sync others watchlist')
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
        error instanceof Error ? error.message : 'An unexpected error occurred',
      )
      setIsSubmitting(false)
      setCurrentStep('token')
      setSelfWatchlistStatus('idle')
      setOthersWatchlistStatus('idle')
      return
    }
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
              ? 'Enter Your Plex Token'
              : currentStep === 'syncing'
                ? 'Setting Up Plex Integration'
                : 'Enter Your Plex Token'}
          </DialogTitle>
          <DialogDescription>
            {!isSubmitting
              ? 'To begin the sync, please enter your Plex token.'
              : currentStep === 'syncing'
                ? 'Please wait while we configure your Plex integration...'
                : 'To begin the sync, please enter your Plex token.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!isSubmitting ? (
            <div className="space-y-4">
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
