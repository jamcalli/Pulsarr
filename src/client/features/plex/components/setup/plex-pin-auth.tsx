import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Button } from '@/components/ui/button'
import { usePlexPinAuth } from '@/features/plex/hooks/usePlexPinAuth'

interface PlexPinAuthProps {
  onSuccess: (token: string) => void
  onCancel?: () => void
  onError?: (reset: () => void) => void
}

/**
 * Component for Plex PIN-based authentication.
 *
 * Displays a button to start the auth flow, then shows QR code
 * and PIN while polling for authorization.
 */
export function PlexPinAuth({
  onSuccess,
  onCancel,
  onError,
}: PlexPinAuthProps) {
  const { pin, token, status, error, generatePin, reset } = usePlexPinAuth()
  const hasCalledSuccess = useRef(false)
  const hasCalledError = useRef(false)

  // Notify parent when token received (only once)
  useEffect(() => {
    if (token && !hasCalledSuccess.current) {
      hasCalledSuccess.current = true
      onSuccess(token)
    }
  }, [token, onSuccess])

  // Notify parent when error occurs (provides reset function)
  useEffect(() => {
    if (
      (status === 'error' || status === 'expired') &&
      !hasCalledError.current
    ) {
      hasCalledError.current = true
      onError?.(reset)
    } else if (status !== 'error' && status !== 'expired') {
      hasCalledError.current = false
    }
  }, [status, reset, onError])

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
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="neutral" onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    )
  }

  // Waiting/Success for authorization - show QR and PIN
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
        {status === 'success' ? (
          <>
            <Check className="h-3 w-3" />
            Authorized!
          </>
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for authorization...
          </>
        )}
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
