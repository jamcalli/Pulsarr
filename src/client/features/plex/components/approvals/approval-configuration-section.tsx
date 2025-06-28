import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import { ApprovalSystemForm } from '@/features/plex/components/approvals/approval-system-form'
import { QuotaSystemForm } from '@/features/plex/components/approvals/quota-system-form'
import { useApprovalScheduler } from '@/features/plex/hooks/useApprovalScheduler'

/**
 * Displays configuration sections for approval and quota systems with status indicators and management forms.
 *
 * Shows the current status of approval and quota maintenance jobs using color-coded badges, and provides forms for updating their configuration. If there is an error loading scheduler data, an error message is displayed instead.
 */
export function ApprovalConfigurationSection() {
  const { approvalMaintenanceJob, quotaMaintenanceJob, schedulerError } =
    useApprovalScheduler()

  if (schedulerError) {
    return (
      <div className="flex justify-center items-center h-24 text-red-500">
        <AlertTriangle className="h-6 w-6 mr-2" />
        <span>Error loading system configuration: {schedulerError}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Approval System */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="approval-system"
          className="border-2 border-border rounded-base overflow-hidden"
        >
          <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
            <div className="flex justify-between items-center w-full pr-2">
              <div>
                <h3 className="text-lg font-medium text-black text-left">
                  Approval System
                </h3>
                <p className="text-sm text-black text-left">
                  Manages approval expiration policies and maintenance
                  scheduling
                </p>
              </div>
              <Badge
                variant="neutral"
                className={cn(
                  'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
                  approvalMaintenanceJob?.enabled
                    ? 'bg-green-500 hover:bg-green-500 text-white'
                    : approvalMaintenanceJob?.last_run?.status === 'failed'
                      ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                      : 'bg-red-500 hover:bg-red-500 text-white',
                )}
              >
                {!approvalMaintenanceJob
                  ? 'Unknown'
                  : !approvalMaintenanceJob.enabled
                    ? 'Disabled'
                    : approvalMaintenanceJob.last_run?.status === 'failed'
                      ? 'Failed'
                      : 'Enabled'}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="p-6 border-t border-border">
              <ApprovalSystemForm />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Quota System */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="quota-system"
          className="border-2 border-border rounded-base overflow-hidden"
        >
          <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
            <div className="flex justify-between items-center w-full pr-2">
              <div>
                <h3 className="text-lg font-medium text-black text-left">
                  Quota System
                </h3>
                <p className="text-sm text-black text-left">
                  Manages quota reset policies and maintenance scheduling
                </p>
              </div>
              <Badge
                variant="neutral"
                className={cn(
                  'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
                  quotaMaintenanceJob?.enabled
                    ? 'bg-green-500 hover:bg-green-500 text-white'
                    : quotaMaintenanceJob?.last_run?.status === 'failed'
                      ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                      : 'bg-red-500 hover:bg-red-500 text-white',
                )}
              >
                {!quotaMaintenanceJob
                  ? 'Unknown'
                  : !quotaMaintenanceJob.enabled
                    ? 'Disabled'
                    : quotaMaintenanceJob.last_run?.status === 'failed'
                      ? 'Failed'
                      : 'Enabled'}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="p-6 border-t border-border">
              <QuotaSystemForm />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
