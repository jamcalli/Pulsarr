import type { ColumnDef } from '@tanstack/react-table'

import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Monitor,
  Tv,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Trash2,
  MoreHorizontal,
  ArrowUpDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

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
          <ContentIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
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
          default:
            return <Badge variant="neutral">{status}</Badge>
        }
      }

      return getStatusBadge()
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
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Trigger
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const trigger = row.getValue('triggeredBy') as string
      const request = row.original

      const getTriggerBadge = () => {
        switch (trigger) {
          case 'quota_exceeded': {
            // Extract numbers from approvalReason like "weekly_rolling quota exceeded (8/5)"
            const quotaMatch = request.approvalReason?.match(/\((\d+\/\d+)\)/)
            const quotaNumbers = quotaMatch ? `${quotaMatch[1]} ` : ''
            return <Badge variant="neutral">{quotaNumbers}Quota Exceeded</Badge>
          }
          case 'router_rule':
            return <Badge variant="default">Router Rule</Badge>
          case 'manual_flag':
            return <Badge variant="neutral">Manual Flag</Badge>
          case 'content_criteria':
            return <Badge variant="neutral">Content Criteria</Badge>
          default:
            return <Badge variant="neutral">{trigger}</Badge>
        }
      }

      return <div className="max-w-[200px]">{getTriggerBadge()}</div>
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
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as string
      return (
        <div className="text-sm">
          {format(new Date(date), 'MMM d, yyyy')}
          <div className="text-xs text-muted-foreground">
            {format(new Date(date), 'HH:mm')}
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
      displayName: 'Expires',
    },
    header: ({ column }) => {
      return (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Expires
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const expiresAt = row.getValue('expiresAt') as string | null

      if (!expiresAt) {
        return <span className="text-muted-foreground text-sm">Never</span>
      }

      const expirationDate = new Date(expiresAt)
      const isExpired = expirationDate < new Date()

      return (
        <div
          className={`text-sm ${isExpired ? 'text-red-600' : 'text-orange-600'}`}
        >
          {format(expirationDate, 'MMM d, yyyy')}
          <div className="text-xs">{format(expirationDate, 'HH:mm')}</div>
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
              <Button
                variant="approveNoShadow"
                size="sm"
                onClick={() => actions.onApprove(request)}
                className="h-8 px-2"
              >
                <CheckCircle className="h-3 w-3" />
              </Button>
              <Button
                variant="rejectNoShadow"
                size="sm"
                onClick={() => actions.onReject(request)}
                className="h-8 px-2"
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="noShadow" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
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
