import { HelpCircle } from 'lucide-react'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserMultiSelect } from '@/components/ui/user-multi-select'

import type { SessionMonitoringComponentProps } from '@/features/utilities/constants/session-monitoring'

interface SessionMonitoringFilteringProps
  extends SessionMonitoringComponentProps {}

/**
 * Renders the filtering options section within a session monitoring form.
 *
 * Displays a user multi-select field for optionally filtering which users are monitored. The field is disabled if monitoring is not enabled. A tooltip provides guidance on the purpose and usage of the filter.
 *
 * @param isEnabled - Whether session monitoring is currently enabled, controlling the availability of the filter.
 */
export function SessionMonitoringFiltering({
  form,
  isEnabled,
}: SessionMonitoringFilteringProps) {
  return (
    <div>
      <h3 className="font-medium text-sm text-foreground mb-2">
        Filtering Options
      </h3>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="filterUsers"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center">
                <FormLabel className="text-foreground">
                  Filter Users (Optional)
                </FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
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
