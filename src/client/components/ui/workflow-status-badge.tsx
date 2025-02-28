import { useWatchlistStatus } from '@/hooks/workflow/useWatchlistStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Square, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export function WatchlistStatusBadge() {
  const status = useWatchlistStatus()
  const { toast } = useToast()
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading'>('idle')
  const [currentAction, setCurrentAction] = useState<'start' | 'stop' | null>(null)
  const [lastStableStatus, setLastStableStatus] = useState<string>(status)
  
  // Track transitions between stable and transitional states
  useEffect(() => {
    // If we're in a stable state, update the last stable state
    if (status === 'running' || status === 'stopped') {
      setLastStableStatus(status)
      
      // If we were in a loading state and now reached a stable state,
      // we can return to idle
      if (actionStatus === 'loading') {
        setActionStatus('idle')
      }
    }
  }, [status, actionStatus])
  
  const getBadgeVariant = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500 hover:bg-green-500 text-white'
      case 'starting':
        return 'bg-yellow-500 hover:bg-yellow-500 text-white'
      case 'stopping':
        return 'bg-orange-500 hover:bg-orange-500 text-white'
      case 'stopped':
        return 'bg-red-500 hover:bg-red-500 text-white'
      default:
        return 'bg-gray-400 hover:bg-gray-400 text-white'
    }
  }
  
  const handleToggle = async () => {
    setActionStatus('loading')
    
    if (status === 'running') {
      setCurrentAction('stop')
    } else {
      setCurrentAction('start')
    }
    
    try {
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      
      if (status === 'running') {
        const response = await fetch('/v1/watchlist-workflow/stop', { method: 'POST' })
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to stop Watchlist workflow: ${response.status}`)
        }
        
        // Success toast for stopping
        toast({
          description: 'Watchlist workflow has been stopped successfully',
          variant: 'default',
        })
      } else {
        const response = await fetch('/v1/watchlist-workflow/start', { method: 'POST' })
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to start Watchlist workflow: ${response.status}`)
        }
        
        // Success toast for starting
        toast({
          description: 'Watchlist workflow has been started successfully',
          variant: 'default',
        })
      }
      
      // Don't set to idle here - we'll wait for the status to stabilize
      // setActionStatus('idle')
    } catch (error) {
      console.error('Watchlist workflow toggle error:', error)
      setActionStatus('idle')
      
      // Error toast
      if (status !== 'running') {
        toast({
          description: 'Failed to start Watchlist workflow. Please check your configuration.',
          variant: 'destructive',
        })
      } else {
        toast({
          description: 'Failed to stop Watchlist workflow',
          variant: 'destructive',
        })
      }
    }
  }
  
  // Don't allow toggling while in a transition state
  const isDisabled = status === 'starting' || status === 'stopping' || actionStatus === 'loading'
  
  // Determine if we should show the loading spinner
  const showLoading = actionStatus === 'loading' || 
                     (currentAction === 'start' && status === 'starting') ||
                     (currentAction === 'stop' && status === 'stopping')
  
  return (
    <div className="ml-2 inline-flex items-center gap-2 h-full">
      <Badge 
        variant="neutral" 
        className={cn('px-2 py-0.5 h-7 text-sm', getBadgeVariant())}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
      
      <Button
        size="sm"
        variant="neutralnoShadow"
        className="h-7 px-2"
        onClick={handleToggle}
        disabled={isDisabled}
      >
        {showLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
            <span>{currentAction === 'stop' ? 'Stopping...' : 'Starting...'}</span>
          </>
        ) : status === 'running' ? (
          <>
            <Square className="h-4 w-4 mr-1 fill-red-500 text-red-500" />
            <span>Stop</span>
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-1 fill-green-500 text-green-500" />
            <span>Start</span>
          </>
        )}
      </Button>
    </div>
  )
}