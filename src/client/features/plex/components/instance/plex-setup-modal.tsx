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
import { useWatchlistProgress } from '@/hooks/useProgress'
import { usePlexConnection } from '@/features/plex/hooks/instance/usePlexConnection'

interface PlexSetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlexSetupModal({ open, onOpenChange }: PlexSetupModalProps) {
  const [plexToken, setPlexToken] = React.useState('')
  const [currentStep, setCurrentStep] = React.useState<'token' | 'syncing'>('token')
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

  const { setupPlex } = usePlexConnection()

  React.useEffect(() => {
    if (
      selfWatchlistStatus === 'success' &&
      othersWatchlistStatus === 'success'
    ) {
      const timer = setTimeout(() => {
        // Close modal after successful setup
        onOpenChange(false)
        
        // Reset state after animation completes
        setTimeout(() => {
          setCurrentStep('token')
          setIsSubmitting(false)
          setSelfWatchlistStatus('idle')
          setOthersWatchlistStatus('idle')
          setPlexToken('')
        }, 150)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [selfWatchlistStatus, othersWatchlistStatus, onOpenChange])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // First setup the token and test
      setCurrentStep('syncing')
      
      // Track self watchlist
      setSelfWatchlistStatus('loading')
      
      // Initially successful token setup
      const success = await setupPlex(plexToken)
      
      if (success) {
        setSelfWatchlistStatus('success')
        
        // Small delay before showing others watchlist progress
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Start tracking other watchlists
        setOthersWatchlistStatus('loading')
        
        // This should already be done by setupPlex, just updating UI status
        setTimeout(() => {
          setOthersWatchlistStatus('success')  
        }, 1000)
      } else {
        throw new Error('Failed to setup Plex token')
      }
    } catch (error) {
      console.error('Setup error:', error)
      // Reset to token input
      setCurrentStep('token')
      setSelfWatchlistStatus('idle')
      setOthersWatchlistStatus('idle')
      setIsSubmitting(false)
    }
  }

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