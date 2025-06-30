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

import type { SessionMonitoringComponentProps } from '@/features/utilities/constants/session-monitoring'

interface SessionMonitoringResetSettingsProps
  extends SessionMonitoringComponentProps {}

/**
 * Displays a form section for configuring rolling monitoring reset and cleanup settings in a session monitoring form.
 *
 * Provides controls to enable automatic reset of rolling monitored shows, progressive cleanup of previous seasons, set the inactivity period before reset, and specify the interval for automatic reset checks. Controls are conditionally disabled based on the {@link isEnabled} prop and the current automatic reset state.
 */
export function SessionMonitoringResetSettings({
  form,
  isEnabled,
}: SessionMonitoringResetSettingsProps) {
  const enableAutoReset = form.watch('enableAutoReset')

  return (
    <div>
      <h3 className="font-medium text-sm text-foreground mb-2">
        Rolling Monitoring Reset Settings
      </h3>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <FormLabel className="text-foreground m-0">
                    Enable Automatic Reset
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
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

          <FormField
            control={form.control}
            name="enableProgressiveCleanup"
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
                  <FormLabel className="text-foreground m-0">
                    Enable Progressive Cleanup
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Immediately clean up previous seasons when a user
                          progresses to a new season, but only if no other users
                          have watched those seasons within the inactivity
                          period. Always preserves the original monitoring state
                          (pilot-only or first-season-only).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="inactivityResetDays"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center">
                  <FormLabel className="text-foreground m-0">
                    Inactivity Reset Days
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
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
                      const raw = e.target.value
                      if (raw === '') {
                        field.onChange(undefined)
                      } else {
                        const value = Math.max(1, Number(raw))
                        if (!Number.isNaN(value)) {
                          field.onChange(value)
                        }
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
                  <FormLabel className="text-foreground m-0">
                    Auto Reset Check Interval (hours)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
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
                      const raw = e.target.value
                      if (raw === '') {
                        field.onChange(undefined)
                      } else {
                        const value = Math.max(1, Number(raw))
                        if (!Number.isNaN(value)) {
                          field.onChange(value)
                        }
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
