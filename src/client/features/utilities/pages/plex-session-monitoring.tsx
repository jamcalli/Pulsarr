import { Loader2, Save, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { PlexSSEStatusBadge } from '@/components/ui/plex-sse-status-badge'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { PlexSessionMonitoringPageSkeleton } from '@/features/utilities/components/session-monitoring/plex-session-monitoring-page-skeleton'

import { SessionMonitoringActions } from '@/features/utilities/components/session-monitoring/session-monitoring-actions'
import { SessionMonitoringConfig } from '@/features/utilities/components/session-monitoring/session-monitoring-config'
import { SessionMonitoringFiltering } from '@/features/utilities/components/session-monitoring/session-monitoring-filtering'
import { SessionMonitoringResetSettings } from '@/features/utilities/components/session-monitoring/session-monitoring-reset-settings'
import { SessionMonitoringStatus } from '@/features/utilities/components/session-monitoring/session-monitoring-status'
import { useSessionMonitoringForm } from '@/features/utilities/hooks/useSessionMonitoring'
import {
  useDeleteShowMutation,
  useInactiveShowsQuery,
  useResetInactiveShowsMutation,
  useResetShowMutation,
  useRollingShowsQuery,
  useRunSessionMonitorMutation,
} from '@/features/utilities/hooks/useSessionMonitoringQueries'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { useConfigStore } from '@/stores/configStore'

export default function PlexSessionMonitoringPage() {
  const { initialize, isInitialized } = useConfigStore()
  const isInitializing = useInitializeWithMinDuration(initialize)

  const {
    form,
    isSaving,
    isToggling,
    isEnabled,
    inactivityDays,
    setInactivityDays,
    onSubmit,
    handleCancel,
    handleToggle,
  } = useSessionMonitoringForm()

  const { data: rollingShowsData, isLoading: rollingShowsLoading } =
    useRollingShowsQuery(isEnabled)
  const { data: inactiveShowsData, isLoading: inactiveShowsLoading } =
    useInactiveShowsQuery(inactivityDays, isEnabled)

  const runMonitor = useRunSessionMonitorMutation()
  const resetShowMutation = useResetShowMutation()
  const deleteShowMutation = useDeleteShowMutation()
  const resetInactiveMutation = useResetInactiveShowsMutation()

  const [activeActionId, setActiveActionId] = useState<number | null>(null)

  const rollingShows = rollingShowsData?.shows ?? []
  const inactiveShows = inactiveShowsData?.shows ?? []

  const handleRunSessionMonitor = async () => {
    try {
      const data = await runMonitor.mutateAsync()
      toast.success(
        `Session monitor completed. Processed ${data.result.processedSessions} sessions, triggered ${data.result.triggeredSearches} searches.`,
      )
    } catch (_err) {
      // Error is surfaced by mutation state
    }
  }

  const handleResetShow = async (id: number) => {
    setActiveActionId(id)
    try {
      const result = await resetShowMutation.mutateAsync(id)
      toast.success(result.message || 'Show reset successfully')
    } catch (_err) {
      // Error is surfaced by mutation state
    } finally {
      setActiveActionId(null)
    }
  }

  const handleDeleteShow = async (id: number) => {
    setActiveActionId(id)
    try {
      const result = await deleteShowMutation.mutateAsync(id)
      toast.success(result.message || 'Show removed successfully')
    } catch (_err) {
      // Error is surfaced by mutation state
    } finally {
      setActiveActionId(null)
    }
  }

  const handleResetInactiveShows = async () => {
    try {
      const currentInactivityDays = form.getValues('inactivityResetDays') ?? 7
      const result = await resetInactiveMutation.mutateAsync(
        currentInactivityDays,
      )
      toast.success(`${result.message} (${result.resetCount} shows reset)`)
    } catch (_err) {
      // Error is surfaced by mutation state
    }
  }

  const getStatus = () => {
    if (!isInitialized || isInitializing) return 'unknown'
    return isEnabled ? 'enabled' : 'disabled'
  }

  return (
    <div>
      <UtilitySectionHeader
        title="Plex Session Monitoring"
        description="Monitor Plex viewing sessions and automatically expand Sonarr monitoring"
        status={getStatus()}
      >
        <PlexSSEStatusBadge />
      </UtilitySectionHeader>

      {!isInitialized || isInitializing ? (
        <PlexSessionMonitoringPageSkeleton />
      ) : (
        <div className="space-y-6">
          <Form {...form}>
            <SessionMonitoringActions
              isEnabled={isEnabled}
              isSubmitting={isSaving}
              isToggling={isToggling}
              onToggle={handleToggle}
            />

            <Separator />

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <SessionMonitoringConfig form={form} isEnabled={isEnabled} />

              <Separator />

              <SessionMonitoringFiltering form={form} isEnabled={isEnabled} />

              <Separator />

              <SessionMonitoringResetSettings
                form={form}
                isEnabled={isEnabled}
              />

              <Separator />

              <SessionMonitoringStatus
                isEnabled={isEnabled}
                rollingShows={rollingShows}
                inactiveShows={inactiveShows}
                rollingLoading={{
                  runningMonitor: runMonitor.isPending,
                  fetchingShows: rollingShowsLoading,
                  fetchingInactive: inactiveShowsLoading,
                  resetting: resetShowMutation.isPending,
                  deleting: deleteShowMutation.isPending,
                }}
                activeActionId={activeActionId}
                inactivityDays={inactivityDays}
                setInactivityDays={setInactivityDays}
                runSessionMonitor={async () => {
                  await handleRunSessionMonitor()
                  return null
                }}
                resetShow={handleResetShow}
                deleteShow={handleDeleteShow}
                resetInactiveShows={handleResetInactiveShows}
              />

              <Separator />

              {/* Information about rolling monitoring */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                <h3 className="font-medium text-foreground mb-2">
                  Rolling Monitoring Options
                </h3>
                <p className="text-sm text-foreground">
                  When adding shows to Sonarr, you can now select "Pilot
                  Rolling" or "First Season Rolling" monitoring options. These
                  will start with minimal episodes and automatically expand as
                  users watch more content. Inactive shows will automatically
                  reset to save storage space.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                {form.formState.isDirty && !isSaving && (
                  <Button
                    type="button"
                    variant="cancel"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="flex items-center gap-1"
                  >
                    <X className="h-4 w-4" />
                    <span>Cancel</span>
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={isSaving || !form.formState.isDirty}
                  className="flex items-center gap-2"
                  variant="blue"
                  aria-busy={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </div>
  )
}
