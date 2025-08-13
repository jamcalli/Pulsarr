import { AlertTriangle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { ApprovalSystemForm } from '@/features/approvals/components/approval-system-form'
import { QuotaSystemForm } from '@/features/approvals/components/quota-system-form'
import { useApprovalScheduler } from '@/features/plex/hooks/useApprovalScheduler'
import { cn } from '@/lib/utils'

type MaintenanceJob =
  | {
      enabled?: boolean
      last_run?: {
        status?: string
      } | null
    }
  | null
  | undefined

/**
 * Renders a status badge for maintenance jobs with appropriate styling and text.
 */
const getStatusBadge = (job: MaintenanceJob) => (
  <Badge
    variant="neutral"
    className={cn(
      'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
      job?.enabled
        ? 'bg-green-500 hover:bg-green-500 text-white'
        : job?.last_run?.status === 'failed'
          ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
          : 'bg-red-500 hover:bg-red-500 text-white',
    )}
  >
    {!job
      ? 'Unknown'
      : !job.enabled
        ? 'Disabled'
        : job.last_run?.status === 'failed'
          ? 'Failed'
          : 'Enabled'}
  </Badge>
)

/**
 * Renders configuration sections for approval and quota systems, displaying their current status and providing management forms.
 *
 * Shows status badges for approval and quota maintenance jobs, and displays forms for updating their configuration. If scheduler data cannot be loaded, an error message is shown instead.
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
              {getStatusBadge(approvalMaintenanceJob)}
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
              {getStatusBadge(quotaMaintenanceJob)}
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
