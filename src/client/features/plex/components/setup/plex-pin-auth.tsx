import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Button } from '@/components/ui/button'
import { usePlexPinAuth } from '@/features/plex/hooks/usePlexPinAuth'

interface PlexPinAuthProps {
  onSuccess: (token: string) => void
  onCancel?: () => void
}

/**
 * Component for Plex PIN-based authentication.
 *
 * Displays a button to start the auth flow, then shows QR code
 * and PIN while polling for authorization.
 */
export function PlexPinAuth({ onSuccess, onCancel }: PlexPinAuthProps) {
  const { pin, token, status, error, generatePin, reset } = usePlexPinAuth()
  const hasCalledSuccess = useRef(false)

  // Notify parent when token received (only once)
  useEffect(() => {
    if (token && !hasCalledSuccess.current) {
      hasCalledSuccess.current = true
      onSuccess(token)
    }
  }, [token, onSuccess])

  // Initial state - show login button
  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <p className="text-sm text-foreground text-center">
          Generate a PIN to link your Plex account.
        </p>
        <Button variant="plex" onClick={generatePin}>
          Login with Plex
        </Button>
      </div>
    )
  }

  // Generating PIN
  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
        <p className="text-sm text-foreground">Generating PIN...</p>
      </div>
    )
  }

  // Error state
  if (status === 'error' || status === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button variant="neutral" onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    )
  }

  // Success state (brief, parent will handle transition)
  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <p className="text-sm text-green-600 dark:text-green-400">
          Connected to Plex!
        </p>
      </div>
    )
  }

  // Waiting for authorization - show QR and PIN
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* QR Code */}
      {pin && (
        <div className="w-40 overflow-hidden rounded-lg border-2 border-border">
          <AspectRatio ratio={1}>
            <img
              src={pin.qr}
              alt="Scan to login with Plex"
              className="h-full w-full object-contain"
            />
          </AspectRatio>
        </div>
      )}

      {/* PIN Code */}
      <div className="text-center">
        <p className="text-sm text-foreground">Your PIN is:</p>
        <p className="mt-1 font-mono text-3xl font-bold text-foreground tracking-widest">
          {pin?.code}
        </p>
        <p className="mt-2 text-sm text-foreground">
          Scan or click below to link your account.
        </p>
      </div>

      {/* Link to Plex */}
      <Button variant="plex" asChild>
        <a
          href={`https://plex.tv/link?pin=${pin?.code}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Plex
          <ExternalLink className="ml-2 h-4 w-4 text-main-foreground" />
        </a>
      </Button>

      {/* Polling status */}
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Waiting for authorization...
      </p>

      {/* Cancel button */}
      {onCancel && (
        <Button variant="noShadow" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
