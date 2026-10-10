import type { ColumnDef } from '@tanstack/react-table'
import { ApprovalExpiry } from '@/components/approval-review/approval-expiry'
import { PosterFrame } from '@/components/poster-frame'
import { StatusPill } from '@/components/status-pill'
import { UserAvatar } from '@/components/user-avatar'
import type { QueueTab } from '@/features/requests/lib/approval-queue/queue-state'
import { useConfig } from '@/hooks/useConfig'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import {
  APPROVAL_STATUS_LABELS,
  expiryLine,
  STATUS_TONES,
  triggerSummary,
} from '@/lib/approval'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import { formatDate, formatRelative } from '@/lib/format'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

function TitleCell({ approval }: { approval: ApprovalRequest }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PosterFrame
        size="thumb"
        thumb={approval.thumb}
        type={approval.contentType}
      />
      <div className="flex min-w-0 flex-col items-start">
        <button
          type="button"
          aria-label={`Review ${approval.contentTitle}`}
          className="rounded-sm text-left font-medium break-words outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
        >
          {approval.contentTitle}
        </button>
        <span className="text-muted-foreground">
          {CONTENT_TYPE_LABELS[approval.contentType]}
        </span>
      </div>
    </div>
  )
}

function RequesterCell({ userName }: { userName: string }) {
  const user = useUserDirectory().lookup(userName)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar name={user.name} avatar={user.avatar} size="sm" />
      <span className="truncate">{user.name}</span>
    </div>
  )
}

function TriggerCell({ approval }: { approval: ApprovalRequest }) {
  const { name } = useUserDirectory().lookup(approval.userName)
  const { config } = useConfig()
  const { line } = triggerSummary(approval, name, config?.quotaSettings ?? null)
  return <span className="text-pretty text-muted-foreground">{line}</span>
}

function ExpiresCell({ approval }: { approval: ApprovalRequest }) {
  const expiry = expiryLine(approval, Date.now())
  if (!expiry) return null
  return <ApprovalExpiry text={expiry.text} soon={expiry.soon} />
}

const title: ColumnDef<ApprovalRequest> = {
  id: 'title',
  header: 'Title',
  accessorFn: (row) => row.contentTitle,
  cell: ({ row }) => <TitleCell approval={row.original} />,
}

const requester: ColumnDef<ApprovalRequest> = {
  id: 'requester',
  header: 'Requested by',
  accessorFn: (row) => row.userName,
  cell: ({ row }) => <RequesterCell userName={row.original.userName} />,
}

const trigger: ColumnDef<ApprovalRequest> = {
  id: 'trigger',
  header: 'Trigger',
  accessorFn: (row) => row.triggeredBy,
  cell: ({ row }) => <TriggerCell approval={row.original} />,
}

const requestedAgo: ColumnDef<ApprovalRequest> = {
  id: 'requested',
  header: 'Requested',
  accessorFn: (row) => row.createdAt,
  cell: ({ row }) => formatRelative(new Date(row.original.createdAt)),
}

const requestedOn: ColumnDef<ApprovalRequest> = {
  ...requestedAgo,
  cell: ({ row }) => formatDate(new Date(row.original.createdAt)),
}

const expires: ColumnDef<ApprovalRequest> = {
  id: 'expires',
  header: 'Expires',
  enableSorting: false,
  cell: ({ row }) => <ExpiresCell approval={row.original} />,
}

const status: ColumnDef<ApprovalRequest> = {
  id: 'status',
  header: 'Status',
  accessorFn: (row) => row.status,
  cell: ({ row }) => (
    <StatusPill
      tone={STATUS_TONES[row.original.status]}
      label={APPROVAL_STATUS_LABELS[row.original.status]}
    />
  ),
}

const decided: ColumnDef<ApprovalRequest> = {
  id: 'decided',
  header: 'Decided',
  enableSorting: false,
  cell: ({ row }) => formatDate(new Date(row.original.updatedAt)),
}

const PENDING_COLUMNS = [title, requester, trigger, requestedAgo]
const PENDING_COLUMNS_WITH_EXPIRES = [...PENDING_COLUMNS, expires]
const HISTORY_COLUMNS = [
  title,
  requester,
  trigger,
  requestedOn,
  status,
  decided,
]

/** Column ids match the queue's sort keys, and the same arguments always return the same array. */
export function queueColumns(
  tab: QueueTab,
  showExpires: boolean,
): ColumnDef<ApprovalRequest>[] {
  if (tab === 'history') return HISTORY_COLUMNS
  return showExpires ? PENDING_COLUMNS_WITH_EXPIRES : PENDING_COLUMNS
}

export const QUEUE_COLUMN_CLASSES: Partial<Record<string, string>> = {
  title: 'min-w-56 whitespace-normal',
  requester: 'max-w-48',
  trigger: 'min-w-48 whitespace-normal',
}
