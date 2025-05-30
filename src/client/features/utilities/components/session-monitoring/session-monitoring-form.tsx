import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Monitor, Save, X, HelpCircle, Power } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { UserMultiSelect } from '@/components/ui/user-multi-select'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useMediaQuery } from '@/hooks/use-media-query'

const sessionMonitoringSchema = z.object({
  enabled: z.boolean(),
  pollingIntervalMinutes: z.number().min(1).max(1440),
  remainingEpisodes: z.number().min(1).max(10),
  filterUsers: z.array(z.string()).optional(),
})

type SessionMonitoringFormData = z.infer<typeof sessionMonitoringSchema>

/**
 * Form component for configuring Plex session monitoring settings within an accordion layout
 */
export function SessionMonitoringForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { config, updateConfig } = useConfigStore()
  const { schedules, toggleScheduleStatus, setLoadingWithMinDuration } =
    useUtilitiesStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingStartTime = useRef<number | null>(null)

  const form = useForm<SessionMonitoringFormData>({
    resolver: zodResolver(sessionMonitoringSchema),
    defaultValues: {
      enabled: config?.plexSessionMonitoring?.enabled || false,
      pollingIntervalMinutes:
        config?.plexSessionMonitoring?.pollingIntervalMinutes || 15,
      remainingEpisodes: config?.plexSessionMonitoring?.remainingEpisodes || 2,
      filterUsers: config?.plexSessionMonitoring?.filterUsers || [],
    },
  })

  // Find the session monitoring schedule
  const sessionMonitorSchedule = schedules?.find(
    (s) => s.name === 'plex-session-monitor',
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
      }
      form.reset(formValues)
    }
  }, [config, form])

  const onSubmit = async (data: SessionMonitoringFormData) => {
    submittingStartTime.current = Date.now()
    setIsSubmitting(true)
    setLoadingWithMinDuration(true)

    try {
      await updateConfig({
        plexSessionMonitoring: data,
      })

      // Update the schedule if it exists
      if (sessionMonitorSchedule) {
        // Check if enabled state changed
        if (sessionMonitorSchedule.enabled !== data.enabled) {
          await toggleScheduleStatus(sessionMonitorSchedule.name, data.enabled)
        }

        // Check if polling interval changed and schedule is enabled
        const currentInterval = sessionMonitorSchedule.config?.minutes || 15
        if (data.enabled && currentInterval !== data.pollingIntervalMinutes) {
          // Update the schedule with new interval
          const response = await fetch(
            `/v1/scheduler/schedules/${sessionMonitorSchedule.name}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'interval',
                config: {
                  minutes: data.pollingIntervalMinutes,
                },
              }),
            },
          )

          if (!response.ok) {
            throw new Error('Failed to update polling interval')
          }

          // Refresh schedules to get updated data
          await schedules?.find((s) => s.name === 'plex-session-monitor')
        }
      }

      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - (submittingStartTime.current || 0)
      const remaining = Math.max(0, 500 - elapsed)

      await new Promise((resolve) => setTimeout(resolve, remaining))

      toast({
        title: 'Success',
        description: 'Session monitoring settings updated successfully',
      })
    } catch (error) {
      console.error('Failed to update session monitoring settings:', error)
      toast({
        title: 'Error',
        description: 'Failed to update session monitoring settings',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
      setLoadingWithMinDuration(false)
      submittingStartTime.current = null
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
                {/* Actions section */}
                <div>
                  <h3 className="font-medium text-text mb-2">Actions</h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        const newEnabledState = !isEnabled
                        form.setValue('enabled', newEnabledState, {
                          shouldDirty: true,
                        })
                        // Auto-save when toggling enable/disable
                        await onSubmit(form.getValues())
                      }}
                      disabled={isSubmitting}
                      variant={isEnabled ? 'error' : 'noShadow'}
                      className="h-8"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
                        {isEnabled ? 'Disable' : 'Enable'}
                      </span>
                    </Button>
                  </div>
                </div>

                <Separator />

                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <div>
                    <h3 className="font-medium text-sm text-text mb-2">
                      Monitoring Configuration
                    </h3>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="pollingIntervalMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center">
                              <FormLabel className="text-text">
                                Polling Interval (minutes)
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      How often to check for active Plex
                                      sessions (1-1440 minutes). Lower values
                                      provide more responsive monitoring but
                                      increase server load.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(Number(e.target.value))
                                }
                                min={1}
                                max={1440}
                                disabled={!isEnabled}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="remainingEpisodes"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center">
                              <FormLabel className="text-text">
                                Remaining Episodes Threshold
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Trigger searches when this many episodes
                                      remain in a season. For example, with
                                      threshold 2, searches trigger when
                                      watching episode 8 of a 10-episode season.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(Number(e.target.value))
                                }
                                min={1}
                                max={10}
                                disabled={!isEnabled}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-medium text-sm text-text mb-2">
                      Filtering Options
                    </h3>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="filterUsers"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center">
                              <FormLabel className="text-text">
                                Filter Users (Optional)
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Only monitor sessions from specific users.
                                      Leave empty to monitor all users. This
                                      helps focus monitoring on users whose
                                      viewing patterns should trigger searches.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <FormControl>
                              <UserMultiSelect
                                field={field}
                                disabled={!isEnabled}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

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
                      expand as users watch more content.
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
