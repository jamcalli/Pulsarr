import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import type { PlexServer } from '@root/schemas/plex/discover-servers.schema'

/**
 * A hook for discovering Plex servers using a token
 *
 * This hook manages the state and API interactions for discovering Plex servers.
 * It handles the loading state, error handling, and provides a function to initiate
 * server discovery using a Plex token.
 *
 * @returns An object containing:
 * - isDiscovering: Boolean indicating if discovery is in progress
 * - error: Any error that occurred during discovery
 * - servers: Array of discovered Plex servers
 * - discoverServers: Function to initiate server discovery with a token
 */
export function usePlexServerDiscovery() {
  const { toast } = useToast()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servers, setServers] = useState<PlexServer[]>([])

  // Function to discover Plex servers
  const discoverServers = useCallback(
    async (token: string) => {
      if (!token) {
        toast({
          title: 'Error',
          description: 'Please enter a Plex token',
          variant: 'destructive',
        })
        return []
      }

      setIsDiscovering(true)
      setError(null)

      // Set up a timeout for the request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5-second timeout

      try {
        const response = await fetch('/v1/plex/discover-servers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plexToken: token }),
          signal: controller.signal,
        })

        // Clear the timeout since we got a response
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to discover Plex servers')
        }

        const data = await response.json()

        if (data.success && data.servers && data.servers.length > 0) {
          setServers(data.servers)
          toast({
            description: `Found ${data.servers.length} Plex server connection options`,
            variant: 'default',
          })
          return data.servers
        }

        setServers([])
        toast({
          title: 'No Servers Found',
          description: 'No Plex servers were found with the provided token',
          variant: 'destructive',
        })
        return []
      } catch (err) {
        // Handle timeout specifically
        if (err instanceof DOMException && err.name === 'AbortError') {
          const timeoutError =
            'Request timed out. Please check your token and try again.'
          setError(timeoutError)
          toast({
            title: 'Timeout Error',
            description: timeoutError,
            variant: 'destructive',
          })
          return []
        }

        // Handle other errors
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to discover Plex servers'

        setError(errorMessage)
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
        return []
      } finally {
        clearTimeout(timeoutId)
        setIsDiscovering(false)
      }
    },
    [toast],
  )

  return {
    isDiscovering,
    error,
    servers,
    discoverServers,
  }
}
