import { HelpCircle } from 'lucide-react'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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

interface SessionMonitoringResetSettingsProps {
  form: UseFormReturn<SessionMonitoringFormData>
  isEnabled: boolean
}

/**
 * Rolling monitoring reset settings section for session monitoring form
 */
export function SessionMonitoringResetSettings({
  form,
  isEnabled,
}: SessionMonitoringResetSettingsProps) {
  const enableAutoReset = form.watch('enableAutoReset')

  return (
    <div>
      <h3 className="font-medium text-sm text-text mb-2">
        Rolling Monitoring Reset Settings
      </h3>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="enableAutoReset"
          render={({ field }) => (
            <FormItem className="flex items-center space-x-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!isEnabled}
                />
              </FormControl>
              <div className="flex items-center">
                <FormLabel className="text-text m-0">
                  Enable Automatic Reset
                </FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Automatically reset rolling monitored shows to their
                        original monitoring state (pilot-only or
                        first-season-only) when they haven't been watched for
                        the specified period.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="inactivityResetDays"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center">
                  <FormLabel className="text-text m-0">
                    Inactivity Reset Days
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Number of days without watching activity before a
                          rolling monitored show is reset to its original
                          monitoring state and excess files are deleted.
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
                    max={365}
                    disabled={!isEnabled || !enableAutoReset}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="autoResetIntervalHours"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center">
                  <FormLabel className="text-text m-0">
                    Auto Reset Check Interval (hours)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          How often to check for inactive rolling monitored
                          shows and perform automatic resets. Lower values
                          provide more responsive cleanup but increase server
                          load.
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
                    max={168}
                    disabled={!isEnabled || !enableAutoReset}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  )
}
