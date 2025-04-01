import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'

// Interface for a Plex server
export interface PlexServer {
  name: string;
  host: string;
  port: number;
  useSsl: boolean;
  local: boolean;
}

/**
 * A hook for discovering Plex servers using a token
 */
export function usePlexServerDiscovery() {
  const { toast } = useToast()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servers, setServers] = useState<PlexServer[]>([])
  
  // Function to discover Plex servers
  const discoverServers = useCallback(async (token: string) => {
    if (!token) {
      toast({
        title: "Error",
        description: "Please enter a Plex token",
        variant: "destructive"
      })
      return []
    }
    
    setIsDiscovering(true)
    setError(null)
    
    try {
      const response = await fetch('/v1/plex/discover-servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plexToken: token }),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to discover Plex servers')
      }
      
      const data = await response.json()
      
      if (data.success && data.servers && data.servers.length > 0) {
        setServers(data.servers)
        toast({
          description: `Found ${data.servers.length} Plex servers`,
          variant: 'default',
        })
        return data.servers
      } else {
        setServers([])
        toast({
          title: 'No Servers Found',
          description: 'No Plex servers were found with the provided token',
          variant: 'destructive',
        })
        return []
      }
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to discover Plex servers'
      
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      return []
    } finally {
      setIsDiscovering(false)
    }
  }, [toast])
  
  return {
    isDiscovering,
    error,
    servers,
    discoverServers
  }
}