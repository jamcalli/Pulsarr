import { Loader2, Save, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'

import { useConfigStore } from '@/stores/configStore'
import { useSessionMonitoring } from '@/features/utilities/hooks/useSessionMonitoring'

import { SessionMonitoringActions } from '@/features/utilities/components/session-monitoring/session-monitoring-actions'
import { SessionMonitoringConfig } from '@/features/utilities/components/session-monitoring/session-monitoring-config'
import { SessionMonitoringFiltering } from '@/features/utilities/components/session-monitoring/session-monitoring-filtering'
import { SessionMonitoringResetSettings } from '@/features/utilities/components/session-monitoring/session-monitoring-reset-settings'
import { SessionMonitoringStatus } from '@/features/utilities/components/session-monitoring/session-monitoring-status'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { PlexSessionMonitoringPageSkeleton } from '@/features/utilities/components/session-monitoring/plex-session-monitoring-page-skeleton'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'

/**
 * Renders the Plex Session Monitoring page, providing a user interface to configure, manage, and monitor Plex session tracking and rolling monitoring reset options.
 *
 * Users can enable or disable session monitoring, adjust monitoring and polling settings, filter users, configure automatic reset and cleanup for rolling monitored shows, and view real-time status of rolling and inactive shows. The page also offers controls for running monitoring actions and managing monitored shows.
 */
export default function PlexSessionMonitoringPage() {
  const { initialize, isInitialized } = useConfigStore()
  const isInitializing = useInitializeWithMinDuration(initialize)

  // Use the centralized hook for all session monitoring logic
  const {
    form,
    isSaving,
    rollingShows,
    inactiveShows,
    inactivityDays,
    setInactivityDays,
    loading,
    activeActionId,
    isEnabled,
    onSubmit,
    handleCancel,
    handleRunSessionMonitor,
    handleResetShow,
    handleDeleteShow,
    handleResetInactiveShows,
    fetchRollingShows,
    fetchInactiveShows,
  } = useSessionMonitoring()

  // Determine status based on configuration state
  const getStatus = () => {
    if (!isInitialized || isInitializing) return 'unknown'
    return isEnabled ? 'enabled' : 'disabled'
  }

  if (!isInitialized || isInitializing) {
    return <PlexSessionMonitoringPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Plex Session Monitoring"
        description="Monitor Plex viewing sessions and automatically expand Sonarr monitoring"
        status={getStatus()}
      />

      <div className="space-y-6">
        <Form {...form}>
          <SessionMonitoringActions
            form={form}
            isEnabled={isEnabled}
            isSubmitting={isSaving}
            onSubmit={onSubmit}
          />

          <Separator />

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <SessionMonitoringConfig form={form} isEnabled={isEnabled} />

            <Separator />

            <SessionMonitoringFiltering form={form} isEnabled={isEnabled} />

            <Separator />

            <SessionMonitoringResetSettings form={form} isEnabled={isEnabled} />

            <Separator />

            <SessionMonitoringStatus
              isEnabled={isEnabled}
              rollingShows={rollingShows || []}
              inactiveShows={inactiveShows || []}
              rollingLoading={{
                runningMonitor: loading.sessionMonitor,
                fetchingShows: loading.rollingShows,
                fetchingInactive: loading.inactiveShows,
                resetting: loading.resetShow,
                deleting: loading.deleteShow,
              }}
              activeActionId={activeActionId}
              inactivityDays={inactivityDays}
              setInactivityDays={setInactivityDays}
              runSessionMonitor={async () => {
                await handleRunSessionMonitor()
                return null // Component expects this signature
              }}
              resetShow={async (id: number) => {
                await handleResetShow(id)
              }}
              deleteShow={async (id: number) => {
                await handleDeleteShow(id)
              }}
              resetInactiveShows={handleResetInactiveShows}
              fetchRollingShows={fetchRollingShows}
              fetchInactiveShows={fetchInactiveShows}
            />

            <Separator />

            {/* Information about rolling monitoring */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
              <h3 className="font-medium text-foreground mb-2">
                Rolling Monitoring Options
              </h3>
              <p className="text-sm text-foreground">
                When adding shows to Sonarr, you can now select "Pilot Rolling"
                or "First Season Rolling" monitoring options. These will start
                with minimal episodes and automatically expand as users watch
                more content. Inactive shows will automatically reset to save
                storage space.
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
    </div>
  )
}
