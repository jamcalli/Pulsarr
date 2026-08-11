import { BookmarkCheck, Loader2, Play, Square } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FirstStartDialog } from '@/components/ui/first-start-dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { updateConfig, useConfig } from '@/hooks/useConfig'
import { useWatchlistStatus } from '@/hooks/workflow/useWatchlistStatus'
import {
  useStartWorkflow,
  useStopWorkflow,
} from '@/hooks/workflow/useWorkflowMutations'
import { apiErrorMessage } from '@/lib/tanstackApi'
import { cn } from '@/lib/utils'

/**
 * Renders a badge and controls for managing the watchlist workflow status.
 *
 * Displays the current workflow status with a badge, provides a button to
 * start or stop the workflow with loading indicators, and shows an auto-start
 * toggle when applicable. Notifies the user of action outcomes via toast messages.
 */
export function WatchlistStatusBadge() {
  const { status, syncMode } = useWatchlistStatus()
  const [currentAction, setCurrentAction] = useState<'start' | 'stop' | null>(
    null,
  )
  const [showFirstStartDialog, setShowFirstStartDialog] = useState(false)
  const { config } = useConfig()

  const {
    mutate: startWorkflow,
    isPending: isStarting,
    isSuccess: isStartSuccess,
    reset: resetStartMutation,
  } = useStartWorkflow()
  const { mutate: stopWorkflow, isPending: isStopping } = useStopWorkflow()

  const isPending = isStarting || isStopping
  const [isTogglingAutoStart, setIsTogglingAutoStart] = useState(false)
  const autoStartId = useId()
  const autoStart = config?._isReady ?? false

  const handleAutoStartChange = useCallback(async (checked: boolean) => {
    setIsTogglingAutoStart(true)
    try {
      await updateConfig({ _isReady: checked })
      toast.success(`Auto-Start ${checked ? 'enabled' : 'disabled'}`)
    } catch {
      toast.error(`Failed to ${checked ? 'enable' : 'disable'} Auto-Start`)
    } finally {
      setIsTogglingAutoStart(false)
    }
  }, [])

  // Reset current action when we reach a stable state
  useEffect(() => {
    if (status === 'running' || status === 'stopped') {
      setCurrentAction(null)
    }
  }, [status])

  // Close first-start dialog after successful start with proper cleanup
  useEffect(() => {
    if (isStartSuccess && showFirstStartDialog) {
      const timer = setTimeout(() => {
        setShowFirstStartDialog(false)
        resetStartMutation()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isStartSuccess, showFirstStartDialog, resetStartMutation])

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

  const doStartWorkflow = () => {
    setCurrentAction('start')
    startWorkflow(
      { autoStart },
      {
        onSuccess: (data) => {
          const autoStartMsg = autoStart ? ' with auto-start enabled' : ''
          toast.success(`${data.message}${autoStartMsg}`)
        },
        onError: (error) => {
          setCurrentAction(null)
          toast.error(
            apiErrorMessage(error) ??
              'Failed to start Watchlist workflow. Please check your configuration.',
          )
        },
      },
    )
  }

  const handleToggle = () => {
    if (status === 'running') {
      setCurrentAction('stop')
      stopWorkflow(undefined, {
        onSuccess: () => {
          toast.success('Watchlist workflow has been stopped successfully')
        },
        onError: (error) => {
          setCurrentAction(null)
          toast.error(
            apiErrorMessage(error) ?? 'Failed to stop Watchlist workflow',
          )
        },
      })
    } else {
      // Show first-start dialog if auto-start was not previously enabled
      // This indicates it's likely the first time starting the workflow
      if (!config?._isReady) {
        setShowFirstStartDialog(true)
      } else {
        doStartWorkflow()
      }
    }
  }

  const handleFirstStartConfirm = () => {
    doStartWorkflow()
  }

  // Reset mutation state when dialog closes to prevent stale isStartSuccess
  const handleFirstStartDialogChange = (open: boolean) => {
    setShowFirstStartDialog(open)
    if (!open) {
      resetStartMutation()
    }
  }

  // No toggling mid-transition; starting needs config for the first-start check
  const isDisabled =
    status === 'starting' ||
    status === 'stopping' ||
    isPending ||
    isTogglingAutoStart ||
    (status !== 'running' && !config)

  // Determine if we should show the loading spinner
  const showLoading =
    isPending ||
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
          <span className="ml-1 text-xs opacity-75 hidden sm:inline">
            ({syncMode === 'polling' ? 'Polling' : 'RSS'})
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
            <span>
              {currentAction === 'stop' ? 'Stopping...' : 'Starting...'}
            </span>
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

      {/* Show auto-start toggle when stopped or running so it can be changed anytime */}
      {(status === 'stopped' ||
        status === 'running' ||
        (status === 'starting' && currentAction === 'start')) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 h-7">
              <div className="flex items-center space-x-2">
                <Switch
                  id={autoStartId}
                  checked={autoStart}
                  onCheckedChange={handleAutoStartChange}
                  disabled={isDisabled}
                />
                <Label
                  htmlFor={autoStartId}
                  className="text-xs text-foreground cursor-pointer flex items-center gap-1"
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
      )}

      <FirstStartDialog
        open={showFirstStartDialog}
        onOpenChange={handleFirstStartDialogChange}
        onConfirm={handleFirstStartConfirm}
        isSubmitting={isStarting}
      />
    </div>
  )
}
