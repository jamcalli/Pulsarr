import { decisionSummary } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

export function ApprovalDecision({ approval }: { approval: ApprovalRequest }) {
  const decision = decisionSummary(approval)
  if (!decision) return null

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading font-bold">Decision</h3>
      <div className="flex flex-col gap-1">
        <p className="font-bold">{decision.label}</p>
        <p className="text-muted-foreground">{decision.at}</p>
      </div>
      {decision.note && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{decision.noteLabel}</p>
          <p className="break-words whitespace-pre-line">{decision.note}</p>
        </div>
      )}
    </section>
  )
}
