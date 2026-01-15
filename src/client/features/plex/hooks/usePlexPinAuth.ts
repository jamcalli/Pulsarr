import type {
  PlexPinPollResponse,
  PlexPinResponse,
} from '@root/schemas/plex/pin.schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export type PlexPinStatus =
  | 'idle'
  | 'generating'
  | 'waiting'
  | 'success'
  | 'expired'
  | 'error'

const POLL_INTERVAL_MS = 5000

/**
 * React hook for Plex PIN-based authentication.
 *
 * Handles generating a PIN, displaying it to the user, and polling
 * until the user authorizes at plex.tv/link.
 */
export function usePlexPinAuth() {
  const [pin, setPin] = useState<PlexPinResponse | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<PlexPinStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track active PIN to prevent stale poll responses from updating state
  const activePinIdRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const generatePin = useCallback(async () => {
    // Stop any existing polling before generating new PIN
    stopPolling()
    activePinIdRef.current = null
    setStatus('generating')
    setError(null)
    setPin(null)
    setToken(null)

    try {
      const response = await fetch(api('/v1/plex/pin'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to generate PIN')
      }

      const data: PlexPinResponse = await response.json()
      activePinIdRef.current = data.id
      setPin(data)
      setStatus('waiting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [stopPolling])

  const startPolling = useCallback(() => {
    if (!pin) return

    // Poll immediately once
    const poll = async () => {
      try {
        const params = new URLSearchParams({ clientId: pin.clientId })
        const response = await fetch(
          api(`/v1/plex/pin/${pin.id}?${params.toString()}`),
          { headers: { Accept: 'application/json' } },
        )

        if (!response.ok) return

        // Guard against stale responses from previous PIN
        if (activePinIdRef.current !== pin.id) return

        const data: PlexPinPollResponse = await response.json()

        if (data.authToken) {
          setToken(data.authToken)
          setStatus('success')
          stopPolling()
        } else if (data.expiresIn <= 0) {
          setStatus('expired')
          setError('PIN expired. Please generate a new one.')
          stopPolling()
        }
      } catch {
        // Silently retry on network errors
      }
    }

    // Start polling
    void poll()
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [pin, stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    activePinIdRef.current = null
    setPin(null)
    setToken(null)
    setError(null)
    setStatus('idle')
  }, [stopPolling])

  // Auto-start polling when PIN is generated
  useEffect(() => {
    if (pin && status === 'waiting') {
      startPolling()
    }
  }, [pin, status, startPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    pin,
    token,
    status,
    error,
    generatePin,
    stopPolling,
    reset,
    isPolling: status === 'waiting',
  }
}
