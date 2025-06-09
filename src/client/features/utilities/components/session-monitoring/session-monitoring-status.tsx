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
import { useMediaQuery } from '@/hooks/use-media-query'
import { toast } from '@/hooks/use-toast'
import { RollingShowsSheet } from '@/features/utilities/components/session-monitoring/rolling-shows-sheet'
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
 * Displays and manages the rolling session monitoring status, including active and inactive shows, for a media application.
 *
 * Renders a UI section with controls to check session status, view lists of active and inactive shows, adjust inactivity thresholds, and perform reset or delete actions. Data fetching and updates are triggered based on user interaction and prop changes. The component is only visible when monitoring is enabled.
 *
 * @remark
 * The inactivity days input is debounced to minimize unnecessary updates. Reset and delete actions are disabled during their respective loading states.
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
  const [showInactiveShows, setShowInactiveShows] = useState(false)
  const [localInactivityDays, setLocalInactivityDays] = useState(inactivityDays)

  // Debounce inactivity days changes to prevent excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localInactivityDays !== inactivityDays) {
        setInactivityDays(localInactivityDays)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [localInactivityDays, inactivityDays, setInactivityDays])

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

  if (!isEnabled) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm text-text">
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
              toast({
                title: 'Error',
                description: 'Failed to run session monitor. Please try again.',
                variant: 'destructive',
              })
            }
          }}
          disabled={rollingLoading.runningMonitor}
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
        <div className="flex items-center justify-between p-3 border-2 border-border rounded-base bg-blue/10">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-text" />
            <span className="text-sm font-medium text-text">Active Shows</span>
            <Badge variant="neutral" className="text-xs">
              {rollingShows.length}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            variant="noShadow"
            onClick={() => setShowActiveShows(true)}
            className="h-7"
          >
            <Eye className="h-4 w-4" />
            <span className={isMobile ? 'hidden' : 'ml-1'}>View</span>
          </Button>
        </div>

        {/* Inactive Shows */}
        <div className="flex items-center justify-between p-3 border-2 border-border rounded-base bg-blue/10">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text" />
            <span className="text-sm font-medium text-text">Inactive</span>
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
            />
            <span className="text-xs text-text mr-1">d</span>
            {inactiveShows.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="error"
                onClick={async () => {
                  try {
                    await resetInactiveShows(localInactivityDays)
                  } catch (error) {
                    console.error('Failed to reset inactive shows:', error)
                    toast({
                      title: 'Error',
                      description:
                        'Failed to reset inactive shows. Please try again.',
                      variant: 'destructive',
                    })
                  }
                }}
                disabled={rollingLoading.resetting}
                className="h-7 px-2"
                title="Reset all inactive shows"
              >
                {rollingLoading.resetting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="noShadow"
              onClick={() => setShowInactiveShows(true)}
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
    </div>
  )
}
