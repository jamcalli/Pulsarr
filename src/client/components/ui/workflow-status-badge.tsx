import { useWatchlistStatus } from '@/hooks/workflow/useWatchlistStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Square, Play, BookmarkCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'
import { apiPath } from '@/lib/api-path'

/**
 * Renders a watchlist workflow status badge with interactive controls to manage the workflow.
 *
 * This component displays the current workflow status as a styled badge and a toggle button that starts or stops
 * the workflow via API calls. It shows a loader during state transitions, updates the badge style accordingly, and
 * displays toast notifications based on the success or failure of the action. When the workflow is running, the badge
 * also shows the current synchronization mode ("Manual Sync" or "RSS"). An auto-start toggle is available when the
 * workflow is stopped or beginning to start.
 *
 * @remark A minimum loading delay of 500ms is enforced to ensure smooth UI feedback during status transitions.
 */
export function WatchlistStatusBadge() {
  const { status, syncMode } = useWatchlistStatus()
  const { toast } = useToast()
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading'>('idle')
  const [currentAction, setCurrentAction] = useState<'start' | 'stop' | null>(null)
  const [_lastStableStatus, setLastStableStatus] = useState<string>(status)
  const config = useConfigStore(state => state.config)
  
  // Change to use a default value of false when null
  const [autoStart, setAutoStart] = useState<boolean>(false)
  
  // Initialize autoStart with _isReady from config when config is loaded
  useEffect(() => {
    if (config && config._isReady !== undefined) {
      setAutoStart(config._isReady)
    }
  }, [config])
  
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
        const response = await fetch(apiPath('/v1/watchlist-workflow/stop'), { method: 'POST' })
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to stop Watchlist workflow: ${response.status}`)
        }
        
        toast({
          description: 'Watchlist workflow has been stopped successfully',
          variant: 'default',
        })
      } else {
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: autoStart ? JSON.stringify({ autoStart: true }) : JSON.stringify({ autoStart: false })
        }
        
        const response = await fetch(apiPath('/v1/watchlist-workflow/start'), requestOptions)
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to start Watchlist workflow: ${response.status}`)
        }
        
        const data = await response.json()
        const autoStartMsg = autoStart ? ' with auto-start enabled' : ''
        toast({
          description: `${data.message}${autoStartMsg}`,
          variant: 'default',
        })
      }
      
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
        {status === 'running' && (
          <span className="ml-1 text-xs opacity-75">
            ({syncMode === 'manual' ? 'Manual Sync' : 'RSS'})
          </span>
        )}
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
      
      {/* Only show auto-start toggle when stopped - now positioned after the button */}
      {(status === 'stopped' || (status === 'starting' && currentAction === 'start')) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 h-7">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-start"
                    checked={autoStart}
                    onCheckedChange={setAutoStart}
                    disabled={isDisabled}
                  />
                  <Label
                    htmlFor="auto-start"
                    className="text-xs text-text cursor-pointer flex items-center gap-1"
                  >
                    <BookmarkCheck className="h-3.5 w-3.5" />
                    Auto-Start
                  </Label>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Auto-Start on app launch</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
