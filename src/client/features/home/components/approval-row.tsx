import { ChevronRight } from 'lucide-react'
import { ApprovalExpiry } from '@/components/approval-review/approval-expiry'
import { ItemButton } from '@/components/item-button'
import { PosterFrame } from '@/components/poster-frame'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import type { PendingApproval } from '@/features/home/hooks/usePendingApprovals'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { expiryLine, requestedLine, triggerSummary } from '@/lib/approval'

interface ApprovalRowProps {
  approval: PendingApproval
  onReview: () => void
}

export function ApprovalRow({ approval, onReview }: ApprovalRowProps) {
  const { name } = useUserDirectory().lookup(approval.userName)
  const trigger = triggerSummary(approval, name)
  const expiry = expiryLine(approval, Date.now())

  return (
    <ItemButton
      aria-label={`Review ${approval.contentTitle}`}
      onClick={onReview}
    >
      <ItemMedia>
        <PosterFrame
          size="thumb"
          thumb={approval.thumb}
          type={approval.contentType}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{approval.contentTitle}</ItemTitle>
        <ItemDescription>{requestedLine(approval, name)}</ItemDescription>
        <ItemDescription className="line-clamp-1">
          {trigger.line}
        </ItemDescription>
        {expiry?.soon && (
          <ApprovalExpiry text={expiry.text} soon className="text-sm" />
        )}
      </ItemContent>
      <ItemActions>
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </ItemButton>
  )
}
