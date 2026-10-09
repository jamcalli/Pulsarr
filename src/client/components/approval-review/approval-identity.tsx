import { CredenzaTitle } from '@/components/credenza'
import { PosterFrame } from '@/components/poster-frame'
import { StatusPill } from '@/components/status-pill'
import { UserAvatar } from '@/components/user-avatar'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import {
  APPROVAL_STATUS_LABELS,
  guidsLine,
  requestedLine,
  STATUS_TONES,
} from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

export function ApprovalIdentity({ approval }: { approval: ApprovalRequest }) {
  const user = useUserDirectory().lookup(approval.userName)
  const ids = guidsLine(approval.contentGuids)

  return (
    <div className="flex items-start gap-4 md:pr-8">
      <PosterFrame
        thumb={approval.thumb}
        type={approval.contentType}
        size="identity"
      />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <StatusPill
          tone={STATUS_TONES[approval.status]}
          label={APPROVAL_STATUS_LABELS[approval.status]}
        />
        <CredenzaTitle className="font-heading text-2xl font-bold text-balance">
          {approval.contentTitle}
        </CredenzaTitle>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserAvatar name={user.name} avatar={user.avatar} size="sm" />
          {requestedLine(approval, user.name)}
        </p>
        {ids && (
          <p className="text-xs break-words text-muted-foreground">{ids}</p>
        )}
      </div>
    </div>
  )
}
