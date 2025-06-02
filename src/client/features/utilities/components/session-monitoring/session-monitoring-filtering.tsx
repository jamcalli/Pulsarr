import { HelpCircle } from 'lucide-react'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { UserMultiSelect } from '@/components/ui/user-multi-select'
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

interface SessionMonitoringFilteringProps {
  form: UseFormReturn<SessionMonitoringFormData>
  isEnabled: boolean
}

/**
 * Filtering options section for session monitoring form
 */
export function SessionMonitoringFiltering({
  form,
  isEnabled,
}: SessionMonitoringFilteringProps) {
  return (
    <div>
      <h3 className="font-medium text-sm text-text mb-2">Filtering Options</h3>
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
                        Only monitor sessions from specific users. Leave empty
                        to monitor all users. This helps focus monitoring on
                        users whose viewing patterns should trigger searches.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormControl>
                <UserMultiSelect field={field} disabled={!isEnabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
