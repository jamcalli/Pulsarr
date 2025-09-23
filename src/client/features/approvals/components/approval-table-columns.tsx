import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import {
  AlertCircle,
  ArrowUpDown,
  Bot,
  CheckCircle,
  Clock,
  Eye,
  Monitor,
  MoreHorizontal,
  Trash2,
  Tv,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ApprovalTableActions {
  onView: (request: ApprovalRequestResponse) => void
  onApprove: (request: ApprovalRequestResponse) => void
  onReject: (request: ApprovalRequestResponse) => void
  onDelete: (request: ApprovalRequestResponse) => void
}

export const createApprovalColumns = (
  actions: ApprovalTableActions,
): ColumnDef<ApprovalRequestResponse>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'contentTitle',
    id: 'contentTitle',
    meta: {
      displayName: 'Content',
    },
    header: ({ column }) => {
      return (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Content
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const request = row.original
      const ContentIcon = request.contentType === 'movie' ? Monitor : Tv

      return (
        <div className="flex items-center gap-2 max-w-[300px]">
          <ContentIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="truncate">
            <div className="font-medium truncate">{request.contentTitle}</div>
            <div className="text-sm text-muted-foreground capitalize">
              {request.contentType}
            </div>
          </div>
        </div>
      )
    },
    enableSorting: true,
    filterFn: (row, id, value) => {
      const title = row.getValue(id) as string
      return title.toLowerCase().includes(value.toLowerCase())
    },
  },
  {
    // Hidden column used only for content type filtering - not displayed in UI
    accessorKey: 'contentType',
    id: 'contentType',
    header: () => null,
    cell: () => null,
    enableSorting: false,
    enableHiding: false,
    size: 0,
    minSize: 0,
    maxSize: 0,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'userName',
    id: 'userName',
    meta: {
      displayName: 'User',
    },
    header: ({ column }) => {
      return (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          User
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const userName = row.getValue('userName') as string
      return <div className="font-medium">{userName}</div>
    },
    enableSorting: true,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'status',
    id: 'status',
    meta: {
      displayName: 'Status',
    },
    header: ({ column }) => {
      return (
        <div className="text-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Status
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => {
      const status = row.getValue('status') as string

      const getStatusBadge = () => {
        switch (status) {
          case 'pending':
            return (
              <Badge
                variant="neutral"
                className="bg-yellow-500 hover:bg-yellow-500 text-black"
              >
                <Clock className="w-3 h-3 mr-1" />
                Pending
              </Badge>
            )
          case 'approved':
            return (
              <Badge
                variant="default"
                className="bg-green-500 hover:bg-green-500 text-black"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Approved
              </Badge>
            )
          case 'rejected':
            return (
              <Badge
                variant="warn"
                className="bg-red-500 hover:bg-red-500 text-black"
              >
                <XCircle className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
            )
          case 'expired':
            return (
              <Badge
                variant="neutral"
                className="bg-gray-400 hover:bg-gray-400 text-black"
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                Expired
              </Badge>
            )
          case 'auto_approved':
            return (
              <Badge
                variant="default"
                className="bg-blue-500 hover:bg-blue-500 text-black"
              >
                <Bot className="w-3 h-3 mr-1" />
                Auto-Approved
              </Badge>
            )
          default:
            return <Badge variant="neutral">{status}</Badge>
        }
      }

      return <div className="flex justify-center">{getStatusBadge()}</div>
    },
    enableSorting: true,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'triggeredBy',
    id: 'triggeredBy',
    meta: {
      displayName: 'Trigger',
    },
    header: ({ column }) => {
      return (
        <div className="text-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Trigger
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => {
      const trigger = row.getValue('triggeredBy') as string
      const request = row.original

      const getTriggerBadge = (hasTooltip = false) => {
        const badgeClass = hasTooltip ? 'cursor-help' : ''
        switch (trigger) {
          case 'quota_exceeded': {
            // Extract numbers from approvalReason like "weekly_rolling quota exceeded (8/5)"
            const quotaMatch = request.approvalReason?.match(/\((\d+\/\d+)\)/)
            const quotaNumbers = quotaMatch ? `${quotaMatch[1]} ` : ''
            return (
              <Badge variant="warn" className={badgeClass}>
                {quotaNumbers}Quota Exceeded
              </Badge>
            )
          }
          case 'router_rule':
            return (
              <Badge variant="default" className={badgeClass}>
                Router Rule
              </Badge>
            )
          case 'manual_flag':
            return (
              <Badge variant="neutral" className={badgeClass}>
                Manual Flag
              </Badge>
            )
          case 'content_criteria':
            return (
              <Badge variant="neutral" className={badgeClass}>
                Content Criteria
              </Badge>
            )
          default:
            return (
              <Badge variant="neutral" className={badgeClass}>
                {trigger}
              </Badge>
            )
        }
      }

      const getTooltipContent = () => {
        const parts = []

        // Always show the full approval reason if available
        if (request.approvalReason) {
          parts.push(`Reason: ${request.approvalReason}`)
        }

        // Add router rule ID for router rule triggers
        if (trigger === 'router_rule' && request.routerRuleId) {
          parts.push(`Rule ID: ${request.routerRuleId}`)
        }

        // Don't show routing information in trigger tooltip - that belongs in the proposed routing section

        return parts.length > 0 ? parts.join('\n') : null
      }

      const tooltipContent = getTooltipContent()
      const badge = getTriggerBadge(!!tooltipContent)

      if (!tooltipContent) {
        return (
          <div className="flex justify-center">
            <div className="max-w-[200px]">{badge}</div>
          </div>
        )
      }

      return (
        <div className="flex justify-center">
          <div className="max-w-[200px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="text-xs whitespace-pre-line">
                    {tooltipContent}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )
    },
    enableSorting: true,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'createdAt',
    id: 'createdAt',
    meta: {
      displayName: 'Created',
    },
    header: ({ column }) => {
      return (
        <div className="text-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as string
      return (
        <div className="text-center">
          <div className="text-sm">
            {format(new Date(date), 'MMM d, yyyy')}
            <div className="text-xs text-muted-foreground">
              {format(new Date(date), 'HH:mm')}
            </div>
          </div>
        </div>
      )
    },
    enableSorting: true,
  },
  {
    accessorKey: 'expiresAt',
    id: 'expiresAt',
    meta: {
      displayName: 'Expires/Resolution',
    },
    header: ({ column }) => {
      return (
        <div className="text-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Expires/Resolution
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => {
      const expiresAt = row.getValue('expiresAt') as string | null
      const status = row.original.status
      const updatedAt = row.original.updatedAt

      // Show resolution date for approved/denied/auto-approved requests
      if (
        status === 'approved' ||
        status === 'rejected' ||
        status === 'auto_approved'
      ) {
        const resolvedDate = new Date(updatedAt)
        return (
          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {format(resolvedDate, 'MMM d, yyyy')}
              <div className="text-xs">{format(resolvedDate, 'HH:mm')}</div>
            </div>
          </div>
        )
      }

      if (!expiresAt) {
        return (
          <div className="text-center">
            <span className="text-muted-foreground text-sm">Never</span>
          </div>
        )
      }

      const expirationDate = new Date(expiresAt)
      const isExpired = expirationDate < new Date()

      return (
        <div className="text-center">
          <div
            className={`text-sm ${isExpired ? 'text-red-600' : 'text-orange-600'}`}
          >
            {format(expirationDate, 'MMM d, yyyy')}
            <div className="text-xs">{format(expirationDate, 'HH:mm')}</div>
          </div>
        </div>
      )
    },
    enableSorting: true,
  },
  {
    id: 'actions',
    header: () => <div className="w-8" />,
    cell: ({ row }) => {
      const request = row.original
      const canTakeAction = request.status === 'pending'
      const isExpired =
        request.expiresAt && new Date(request.expiresAt) < new Date()

      return (
        <div className="flex items-center gap-1">
          {canTakeAction && !isExpired && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="approveNoShadow"
                      size="sm"
                      onClick={() => actions.onApprove(request)}
                      className="h-8 px-2"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Approve request</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="rejectNoShadow"
                      size="sm"
                      onClick={() => actions.onReject(request)}
                      className="h-8 px-2"
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Reject request</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="noShadow" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">More actions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.onView(request)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {/* Only show approve/reject in dropdown when action buttons are NOT displayed */}
              {(!canTakeAction || isExpired) && (
                <>
                  {/* Show approve option for rejected requests (can change rejected -> approved) */}
                  {request.status === 'rejected' && (
                    <DropdownMenuItem
                      onClick={() => actions.onApprove(request)}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuItem
                onClick={() => actions.onDelete(request)}
                className="text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
]
