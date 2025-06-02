import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, X } from 'lucide-react'
import { Form } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useRollingMonitoring } from '@/features/utilities/hooks/useRollingMonitoring'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { SessionMonitoringActions } from './session-monitoring-actions'
import { SessionMonitoringConfig } from './session-monitoring-config'
import { SessionMonitoringFiltering } from './session-monitoring-filtering'
import { SessionMonitoringResetSettings } from './session-monitoring-reset-settings'
import { SessionMonitoringStatus } from './session-monitoring-status'

const sessionMonitoringSchema = z.object({
  enabled: z.boolean(),
  pollingIntervalMinutes: z.number().min(1).max(1440),
  remainingEpisodes: z.number().min(1).max(10),
  filterUsers: z.array(z.string()).optional(),
  enableAutoReset: z.boolean(),
  inactivityResetDays: z.number().min(1).max(365),
  autoResetIntervalHours: z.number().min(1).max(168),
})

type SessionMonitoringFormData = z.infer<typeof sessionMonitoringSchema>

/**
 * Provides a form interface for configuring Plex session monitoring and rolling monitoring reset settings.
 *
 * Allows users to enable or disable Plex session monitoring, set polling intervals, define episode thresholds, filter by users, and configure automatic reset options for rolling monitored shows. Integrates with schedule management and displays real-time status and management tools for active and inactive rolling shows.
 */
export function SessionMonitoringForm() {
  const { config, updateConfig } = useConfigStore()
  const {
    schedules,
    toggleScheduleStatus,
    setLoadingWithMinDuration,
    fetchSchedules,
  } = useUtilitiesStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingStartTime = useRef<number | null>(null)
  const [inactivityDays, setInactivityDays] = useState(
    config?.plexSessionMonitoring?.inactivityResetDays || 7,
  )

  const {
    rollingShows,
    inactiveShows,
    loading: rollingLoading,
    activeActionId,
    fetchRollingShows,
    fetchInactiveShows,
    resetShow,
    deleteShow,
    resetInactiveShows,
    runSessionMonitor,
  } = useRollingMonitoring()

  const form = useForm<SessionMonitoringFormData>({
    resolver: zodResolver(sessionMonitoringSchema),
    defaultValues: {
      enabled: config?.plexSessionMonitoring?.enabled || false,
      pollingIntervalMinutes:
        config?.plexSessionMonitoring?.pollingIntervalMinutes || 15,
      remainingEpisodes: config?.plexSessionMonitoring?.remainingEpisodes || 2,
      filterUsers: config?.plexSessionMonitoring?.filterUsers || [],
      enableAutoReset: config?.plexSessionMonitoring?.enableAutoReset ?? true,
      inactivityResetDays:
        config?.plexSessionMonitoring?.inactivityResetDays || 7,
      autoResetIntervalHours:
        config?.plexSessionMonitoring?.autoResetIntervalHours || 24,
    },
  })

  // Find the session monitoring schedules
  const sessionMonitorSchedule = schedules?.find(
    (s) => s.name === 'plex-session-monitor',
  )
  const autoResetSchedule = schedules?.find(
    (s) => s.name === 'plex-rolling-auto-reset',
  )

  // Determine the enabled status
  const isEnabled = form.watch('enabled')

  // Reset form when config changes
  useEffect(() => {
    if (config?.plexSessionMonitoring) {
      const formValues = {
        enabled: config.plexSessionMonitoring.enabled || false,
        pollingIntervalMinutes:
          config.plexSessionMonitoring.pollingIntervalMinutes || 15,
        remainingEpisodes: config.plexSessionMonitoring.remainingEpisodes || 2,
        filterUsers: config.plexSessionMonitoring.filterUsers || [],
        enableAutoReset: config.plexSessionMonitoring.enableAutoReset ?? true,
        inactivityResetDays:
          config.plexSessionMonitoring.inactivityResetDays || 7,
        autoResetIntervalHours:
          config.plexSessionMonitoring.autoResetIntervalHours || 24,
      }
      form.reset(formValues)
      setInactivityDays(config.plexSessionMonitoring.inactivityResetDays || 7)
    }
  }, [config, form])

  // Initial data fetch when session monitoring is enabled
  useEffect(() => {
    if (isEnabled) {
      fetchRollingShows()
      fetchInactiveShows(inactivityDays)
    }
  }, [isEnabled, fetchRollingShows, fetchInactiveShows, inactivityDays])

  // Helper function to update session monitor schedule
  const updateSessionMonitorSchedule = async (
    schedule: JobStatus,
    data: SessionMonitoringFormData,
  ) => {
    // Check if enabled state changed
    if (schedule.enabled !== data.enabled) {
      await toggleScheduleStatus(schedule.name, data.enabled)
    }

    // Check if polling interval changed and schedule is enabled
    const currentInterval =
      schedule.type === 'interval' ? schedule.config?.minutes || 15 : 15
    if (data.enabled && currentInterval !== data.pollingIntervalMinutes) {
      // Update the schedule with new interval
      const response = await fetch(`/v1/scheduler/schedules/${schedule.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'interval',
          config: {
            minutes: data.pollingIntervalMinutes,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update polling interval')
      }

      // Refresh schedules to get updated data
      await fetchSchedules()
    }
  }

  // Helper function to update auto-reset schedule
  const updateAutoResetSchedule = async (
    schedule: JobStatus,
    data: SessionMonitoringFormData,
  ) => {
    // Auto-reset should be enabled when session monitoring is enabled AND enableAutoReset is true
    const shouldEnableAutoReset = data.enabled && data.enableAutoReset

    // Check if enabled state changed
    if (schedule.enabled !== shouldEnableAutoReset) {
      await toggleScheduleStatus(schedule.name, shouldEnableAutoReset)
    }

    // Check if auto-reset interval changed and schedule should be enabled
    const currentAutoResetInterval =
      schedule.type === 'interval' ? schedule.config?.hours || 24 : 24
    if (
      shouldEnableAutoReset &&
      currentAutoResetInterval !== data.autoResetIntervalHours
    ) {
      // Update the schedule with new interval
      const response = await fetch(`/v1/scheduler/schedules/${schedule.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'interval',
          config: {
            hours: data.autoResetIntervalHours,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.error || 'Failed to update auto-reset interval',
        )
      }

      // Refresh schedules to get updated data
      await fetchSchedules()
    }
  }

  // Helper function to ensure minimum loading time for better UX
  const ensureMinimumLoadingTime = async () => {
    const elapsed = Date.now() - (submittingStartTime.current || 0)
    const remaining = Math.max(0, 500 - elapsed)
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }

  // Helper function to show success toast
  const showSuccessToast = () => {
    toast({
      title: 'Success',
      description: 'Session monitoring settings updated successfully',
    })
  }

  // Helper function to handle submit errors
  const handleSubmitError = (error: unknown) => {
    console.error('Failed to update session monitoring settings:', error)
    toast({
      title: 'Error',
      description: 'Failed to update session monitoring settings',
      variant: 'destructive',
    })
  }

  // Helper function to cleanup submit state
  const cleanupSubmitState = () => {
    setIsSubmitting(false)
    setLoadingWithMinDuration(false)
    submittingStartTime.current = null
  }

  const onSubmit = async (data: SessionMonitoringFormData) => {
    submittingStartTime.current = Date.now()
    setIsSubmitting(true)
    setLoadingWithMinDuration(true)

    try {
      await updateConfig({
        plexSessionMonitoring: data,
      })

      if (sessionMonitorSchedule) {
        await updateSessionMonitorSchedule(sessionMonitorSchedule, data)
      }

      if (autoResetSchedule) {
        await updateAutoResetSchedule(autoResetSchedule, data)
      }

      await ensureMinimumLoadingTime()
      showSuccessToast()
    } catch (error) {
      handleSubmitError(error)
    } finally {
      cleanupSubmitState()
    }
  }

  const handleCancel = () => {
    form.reset()
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="session-monitoring"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-text text-left">
                Plex Session Monitoring
              </h3>
              <p className="text-sm text-text text-left">
                Monitor Plex viewing sessions and automatically expand Sonarr
                monitoring
              </p>
            </div>
            <Badge
              variant="neutral"
              className={cn(
                'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
                isEnabled
                  ? 'bg-green-500 hover:bg-green-500 text-white'
                  : 'bg-red-500 hover:bg-red-500 text-white',
              )}
            >
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0">
          <div className="p-6 border-t border-border">
            <div className="space-y-6">
              <Form {...form}>
                <SessionMonitoringActions
                  form={form}
                  isEnabled={isEnabled}
                  isSubmitting={isSubmitting}
                  onSubmit={onSubmit}
                />

                <Separator />

                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <SessionMonitoringConfig form={form} isEnabled={isEnabled} />

                  <Separator />

                  <SessionMonitoringFiltering
                    form={form}
                    isEnabled={isEnabled}
                  />

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
                    rollingLoading={rollingLoading}
                    activeActionId={activeActionId}
                    inactivityDays={inactivityDays}
                    setInactivityDays={setInactivityDays}
                    runSessionMonitor={runSessionMonitor}
                    resetShow={resetShow}
                    deleteShow={deleteShow}
                    resetInactiveShows={resetInactiveShows}
                    fetchRollingShows={fetchRollingShows}
                    fetchInactiveShows={fetchInactiveShows}
                  />

                  <Separator />

                  {/* Information about rolling monitoring */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                    <h3 className="font-medium text-text mb-2">
                      Rolling Monitoring Options
                    </h3>
                    <p className="text-sm text-text">
                      When adding shows to Sonarr, you can now select "Pilot
                      Rolling" or "First Season Rolling" monitoring options.
                      These will start with minimal episodes and automatically
                      expand as users watch more content. Inactive shows will
                      automatically reset to save storage space.
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                    {form.formState.isDirty && !isSubmitting && (
                      <Button
                        type="button"
                        variant="cancel"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="flex items-center gap-1"
                      >
                        <X className="h-4 w-4" />
                        <span>Cancel</span>
                      </Button>
                    )}

                    <Button
                      type="submit"
                      disabled={isSubmitting || !form.formState.isDirty}
                      className="flex items-center gap-2"
                      variant="blue"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
