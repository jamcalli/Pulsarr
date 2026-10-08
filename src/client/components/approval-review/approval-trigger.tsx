import { ApprovalExpiry } from '@/components/approval-review/approval-expiry'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { expiryLine, triggerSummary } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

export function ApprovalTrigger({ approval }: { approval: ApprovalRequest }) {
  const { name } = useUserDirectory().lookup(approval.userName)
  const trigger = triggerSummary(approval, name)
  const expiry =
    approval.status === 'pending' ? expiryLine(approval, Date.now()) : null

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading font-bold">Why it was held</h3>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{trigger.kind}</p>
        <p className="font-bold">{trigger.line}</p>
        {trigger.reason && <p>{trigger.reason}</p>}
      </div>
      {expiry && <ApprovalExpiry text={expiry.text} soon={expiry.soon} />}
    </section>
  )
}
