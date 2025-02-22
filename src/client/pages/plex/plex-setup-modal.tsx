import React from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useWatchlistProgress } from '@/hooks/useProgress'

interface PlexSetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlexSetupModal({ open, onOpenChange }: PlexSetupModalProps) {
  const { toast } = useToast()
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [plexToken, setPlexToken] = React.useState('')
  const [currentStep, setCurrentStep] = React.useState<'token' | 'syncing'>(
    'token',
  )
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  // Track loading states for each step
  const [selfWatchlistStatus, setSelfWatchlistStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [othersWatchlistStatus, setOthersWatchlistStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  // Watch for completion
  React.useEffect(() => {
    if (
      selfWatchlistStatus === 'success' &&
      othersWatchlistStatus === 'success'
    ) {
      const timer = setTimeout(() => {
        onOpenChange(false)
        // Add a small delay before resetting states
        setTimeout(() => {
          setCurrentStep('token')
          setIsSubmitting(false)
          setSelfWatchlistStatus('idle')
          setOthersWatchlistStatus('idle')
        }, 150) // Small delay to ensure modal is closed
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [selfWatchlistStatus, othersWatchlistStatus, onOpenChange])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Submit token
      await updateConfig({
        plexTokens: [plexToken],
      })

      // Verify token
      const plexPingResponse = await fetch('/v1/plex/ping', {
        method: 'GET',
      })
      const plexPingResult = await plexPingResponse.json()

      if (!plexPingResult.success) {
        throw new Error('Invalid Plex token')
      }

      setCurrentStep('syncing')

      // Start self watchlist sync
      setSelfWatchlistStatus('loading')
      const watchlistResponse = await fetch('/v1/plex/self-watchlist-token', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!watchlistResponse.ok) {
        throw new Error('Failed to sync watchlist')
      }

      // When self is done, start others
      setSelfWatchlistStatus('success')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Now sync others watchlist
      setOthersWatchlistStatus('loading')
      const othersResponse = await fetch('/v1/plex/others-watchlist-token', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!othersResponse.ok) {
        throw new Error('Failed to sync others watchlist')
      }

      // Generate RSS feeds (no progress display needed)
      await fetch('/v1/plex/generate-rss-feeds', {
        method: 'GET',
      })

      setOthersWatchlistStatus('success')

      toast({
        description: 'Plex configuration has been successfully completed',
        variant: 'default',
      })
    } catch (error) {
      console.error('Setup error:', error)
      toast({
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        variant: 'destructive',
      })
      setIsSubmitting(false)
      setCurrentStep('token')
      setSelfWatchlistStatus('idle')
      setOthersWatchlistStatus('idle')
      return
    }
  }

  // Prevent closing during submission
  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting && currentStep === 'token') {
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => {
          if (isSubmitting || currentStep === 'syncing') {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting || currentStep === 'syncing') {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-text">
            {currentStep === 'token'
              ? 'Enter Your Plex Token'
              : 'Setting Up Plex Integration'}
          </DialogTitle>
          <DialogDescription>
            {currentStep === 'token'
              ? 'To begin using Plex features, please enter your Plex token.'
              : 'Please wait while we configure your Plex integration...'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {currentStep === 'token' ? (
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
          ) : (
            <div className="space-y-4">
              {(selfWatchlistStatus === 'loading' ||
                (selfWatchlistStatus === 'success' &&
                  othersWatchlistStatus === 'idle')) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text">
                      {selfWatchlistProgress.message ||
                        'Syncing Your Watchlist'}
                    </span>
                    <span className="text-sm text-text">
                      {selfWatchlistProgress.progress}%
                    </span>
                  </div>
                  <Progress value={selfWatchlistProgress.progress} />
                </div>
              )}

              {othersWatchlistStatus === 'loading' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text">
                      {othersWatchlistProgress.message ||
                        "Syncing Others' Watchlists"}
                    </span>
                    <span className="text-sm text-text">
                      {othersWatchlistProgress.progress}%
                    </span>
                  </div>
                  <Progress value={othersWatchlistProgress.progress} />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PlexSetupModal
