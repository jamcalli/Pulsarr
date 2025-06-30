import { useDiscordStatus } from '@/hooks/notifications/useDiscordStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Square, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { toast } from 'sonner'

export function DiscordStatusBadge() {
  const status = useDiscordStatus()
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading'>('idle')
  const [currentAction, setCurrentAction] = useState<'start' | 'stop' | null>(null)
  
  const getBadgeVariant = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500 hover:bg-green-500 text-black'
      case 'starting':
        return 'bg-yellow-500 hover:bg-yellow-500 text-black'
      case 'stopping':
        return 'bg-orange-500 hover:bg-orange-500 text-black'
      case 'stopped':
        return 'bg-red-500 hover:bg-red-500 text-black'
      default:
        return 'bg-gray-400 hover:bg-gray-400 text-black'
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
        const response = await fetch('/v1/notifications/discordstop', { method: 'POST' })
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to stop Discord bot: ${response.status}`)
        }
        
        // Success toast for stopping
        toast.success('Discord bot has been stopped successfully')
      } else {
        const response = await fetch('/v1/notifications/discordstart', { method: 'POST' })
        await minimumLoadingTime
        
        if (!response.ok) {
          throw new Error(`Failed to start Discord bot: ${response.status}`)
        }
        
        // Success toast for starting
        toast.success('Discord bot has been started successfully')
      }
      
      setActionStatus('idle')
      // Keep the current action set until the next user interaction
    } catch (error) {
      console.error('Discord bot toggle error:', error)
      setActionStatus('idle')
      
      // Enhanced error message for start failure
      if (status !== 'running') {
        toast.error('Failed to start Discord bot. Please check your bot token, client ID, and guild ID settings.')
      } else {
        toast.error('Failed to stop Discord bot')
      }
    }
  }

  // Don't allow toggling while in a transition state
  const isDisabled = status === 'starting' || status === 'stopping' || actionStatus === 'loading'
  
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
        {actionStatus === 'loading' ? (
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