import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Loader2,
  Activity,
  Clock,
  AlertTriangle,
  Eye,
  RotateCcw,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { RollingShowsSheet } from '@/features/utilities/components/session-monitoring/rolling-shows-sheet'
import { BulkResetInactiveAlert } from '@/features/utilities/components/session-monitoring/bulk-reset-inactive-alert'
import type { RollingMonitoredShow } from '@/features/utilities/hooks/useRollingMonitoring'
import type { SessionMonitoringResult } from '@root/types/plex-session.types'

interface RollingLoading {
  runningMonitor: boolean
  fetchingShows: boolean
  fetchingInactive: boolean
  resetting: boolean
  deleting: boolean
}

interface SessionMonitoringStatusProps {
  isEnabled: boolean
  rollingShows: RollingMonitoredShow[]
  inactiveShows: RollingMonitoredShow[]
  rollingLoading: RollingLoading
  activeActionId: number | null
  inactivityDays: number
  setInactivityDays: (days: number) => void
  runSessionMonitor: () => Promise<SessionMonitoringResult | null>
  resetShow: (id: number) => Promise<void>
  deleteShow: (id: number, shouldReset?: boolean) => Promise<void>
  resetInactiveShows: (days: number) => Promise<void>
  fetchRollingShows: () => Promise<void>
  fetchInactiveShows: (days: number) => Promise<void>
}

/**
 * Displays and manages the session monitoring status for active and inactive media shows.
 *
 * Provides controls to check session status, view and manage lists of active and inactive shows, adjust the inactivity days threshold, and perform reset or delete actions. All interactive elements are disabled when monitoring is not enabled or when relevant operations are in progress.
 *
 * @remark
 * The inactivity days threshold input is debounced to minimize unnecessary updates. Reset and delete actions are unavailable while their respective operations are running.
 */
export function SessionMonitoringStatus({
  isEnabled,
  rollingShows,
  inactiveShows,
  rollingLoading,
  activeActionId,
  inactivityDays,
  setInactivityDays,
  runSessionMonitor,
  resetShow,
  deleteShow,
  resetInactiveShows,
  fetchRollingShows,
  fetchInactiveShows,
}: SessionMonitoringStatusProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [showActiveShows, setShowActiveShows] = useState(false)
  const [showBulkResetConfirmation, setShowBulkResetConfirmation] =
    useState(false)
  const [showInactiveShows, setShowInactiveShows] = useState(false)
  const [localInactivityDays, setLocalInactivityDays] = useState(inactivityDays)

  // Debounced inactivity days handler to prevent excessive API calls
  const debouncedSetInactivityDays = useDebounce((days: number) => {
    setInactivityDays(days)
  }, 500)

  // Update debounced handler when localInactivityDays changes
  useEffect(() => {
    if (localInactivityDays !== inactivityDays) {
      debouncedSetInactivityDays(localInactivityDays)
    }
  }, [localInactivityDays, inactivityDays, debouncedSetInactivityDays])

  // Sync local state when prop changes (e.g., from config updates)
  useEffect(() => {
    setLocalInactivityDays(inactivityDays)
  }, [inactivityDays])

  // Optimized data fetching for sheet interactions
  useEffect(() => {
    if (isEnabled && showActiveShows) {
      fetchRollingShows()
    }
  }, [isEnabled, showActiveShows, fetchRollingShows])

  useEffect(() => {
    if (isEnabled && showInactiveShows) {
      fetchInactiveShows(inactivityDays)
    }
  }, [isEnabled, showInactiveShows, inactivityDays, fetchInactiveShows])

  // Handle bulk reset of inactive shows with confirmation
  const handleBulkResetConfirm = async () => {
    try {
      await resetInactiveShows(localInactivityDays)
      setShowBulkResetConfirmation(false)
      toast.success(
        `Successfully reset ${inactiveShows.length} inactive show${inactiveShows.length !== 1 ? 's' : ''}`,
      )
    } catch (error) {
      console.error('Failed to reset inactive shows:', error)
      toast.error('Failed to reset inactive shows. Please try again.')
    }
  }

  // Show disabled state instead of hiding completely for better UX consistency

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm text-foreground">
          Rolling Monitoring Status
        </h3>
        <Button
          type="button"
          size="sm"
          variant="noShadow"
          onClick={async () => {
            try {
              await runSessionMonitor()
            } catch (error) {
              console.error('Failed to run session monitor:', error)
              toast.error('Failed to run session monitor. Please try again.')
            }
          }}
          disabled={!isEnabled || rollingLoading.runningMonitor}
          aria-disabled={!isEnabled || rollingLoading.runningMonitor}
          className="h-7"
        >
          {rollingLoading.runningMonitor ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          <span className={isMobile ? 'hidden' : 'ml-2'}>Check Sessions</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Active Rolling Shows */}
        <div className="flex items-center justify-between p-3 border-2 border-border rounded-base bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">
              Active Shows
            </span>
            <Badge variant="neutral" className="text-xs">
              {rollingShows.length}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            variant="noShadow"
            onClick={() => setShowActiveShows(true)}
            disabled={!isEnabled}
            aria-disabled={!isEnabled}
            className="h-7"
          >
            <Eye className="h-4 w-4" />
            <span className={isMobile ? 'hidden' : 'ml-1'}>View</span>
          </Button>
        </div>

        {/* Inactive Shows */}
        <div className="flex items-center justify-between p-3 border-2 border-border rounded-base bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">
              Inactive
            </span>
            <Badge variant="neutral" className="text-xs">
              {inactiveShows.length}
            </Badge>
            {inactiveShows.length > 0 && (
              <Badge
                variant="neutral"
                className="bg-yellow-100 text-yellow-800 text-xs hidden sm:inline-flex"
              >
                <AlertTriangle className="h-3 w-3" />
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={localInactivityDays}
              onChange={(e) => {
                const inputValue = e.target.value
                // Allow empty state while typing
                if (inputValue === '') {
                  return
                }
                const value = Number(inputValue)
                if (!Number.isNaN(value) && value >= 1 && value <= 365) {
                  setLocalInactivityDays(value)
                }
              }}
              onBlur={(e) => {
                // Reset to previous valid value if empty or invalid
                const value = Number(e.target.value)
                if (
                  e.target.value === '' ||
                  Number.isNaN(value) ||
                  value < 1 ||
                  value > 365
                ) {
                  setLocalInactivityDays(inactivityDays)
                }
              }}
              min={1}
              max={365}
              className="h-7 w-12 text-xs px-2"
              aria-label="Inactivity days threshold"
              disabled={!isEnabled}
              aria-disabled={!isEnabled}
            />
            <span className="text-xs text-foreground mr-1">d</span>
            {inactiveShows.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="error"
                      onClick={() => setShowBulkResetConfirmation(true)}
                      disabled={
                        !isEnabled ||
                        rollingLoading.resetting ||
                        inactiveShows.length === 0
                      }
                      aria-disabled={
                        !isEnabled ||
                        rollingLoading.resetting ||
                        inactiveShows.length === 0
                      }
                      className="h-7 px-2"
                    >
                      {rollingLoading.resetting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset all inactive shows</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button
              type="button"
              size="sm"
              variant="noShadow"
              onClick={() => setShowInactiveShows(true)}
              disabled={!isEnabled}
              aria-disabled={!isEnabled}
              className="h-7"
            >
              <Eye className="h-4 w-4" />
              <span className={isMobile ? 'hidden' : 'ml-1'}>View</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Rolling Shows Sheets */}
      <RollingShowsSheet
        isOpen={showActiveShows}
        onClose={() => setShowActiveShows(false)}
        title="Active Rolling Shows"
        shows={rollingShows}
        isLoading={rollingLoading.fetchingShows}
        onResetShow={resetShow}
        onDeleteShow={deleteShow}
        showActions={true}
        actionLoading={{
          resetting: rollingLoading.resetting,
          deleting: rollingLoading.deleting,
        }}
        activeActionId={activeActionId}
      />

      <RollingShowsSheet
        isOpen={showInactiveShows}
        onClose={() => setShowInactiveShows(false)}
        title={`Inactive Shows (${inactivityDays}+ days)`}
        shows={inactiveShows}
        isLoading={rollingLoading.fetchingInactive}
        showActions={false}
      />

      <BulkResetInactiveAlert
        open={showBulkResetConfirmation}
        onOpenChange={setShowBulkResetConfirmation}
        onConfirm={handleBulkResetConfirm}
        inactiveCount={inactiveShows.length}
        inactivityDays={localInactivityDays}
        isLoading={rollingLoading.resetting}
      />
    </div>
  )
}
