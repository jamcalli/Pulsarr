import { HelpCircle } from 'lucide-react'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { UseFormReturn } from 'react-hook-form'

type SessionMonitoringFormData = {
  enabled: boolean
  pollingIntervalMinutes: number
  remainingEpisodes: number
  filterUsers?: string[]
  enableAutoReset: boolean
  inactivityResetDays: number
  autoResetIntervalHours: number
}

interface SessionMonitoringConfigProps {
  form: UseFormReturn<SessionMonitoringFormData>
  isEnabled: boolean
}

/**
 * Renders a configuration section for session monitoring settings within a form.
 *
 * Displays input fields for polling interval and remaining episodes threshold, each with explanatory tooltips and validation. Inputs are disabled when monitoring is not enabled.
 */
export function SessionMonitoringConfig({
  form,
  isEnabled,
}: SessionMonitoringConfigProps) {
  return (
    <div>
      <h3 className="font-medium text-sm text-text mb-2">
        Monitoring Configuration
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="pollingIntervalMinutes"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center">
                <FormLabel className="text-text m-0">
                  Polling Interval (minutes)
                </FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        How often to check for active Plex sessions (1-1440
                        minutes). Lower values provide more responsive
                        monitoring but increase server load.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={(e) => {
                    const value =
                      e.target.value === '' ? 0 : Number(e.target.value)
                    if (!Number.isNaN(value)) {
                      field.onChange(value)
                    }
                  }}
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
            <FormItem className="space-y-1">
              <div className="flex items-center">
                <FormLabel className="text-text m-0">
                  Remaining Episodes Threshold
                </FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Trigger searches when this many episodes remain in a
                        season. For example, with threshold 2, searches trigger
                        when watching episode 8 of a 10-episode season.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={(e) => {
                    const value =
                      e.target.value === '' ? 0 : Number(e.target.value)
                    if (!Number.isNaN(value)) {
                      field.onChange(value)
                    }
                  }}
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
  )
}
