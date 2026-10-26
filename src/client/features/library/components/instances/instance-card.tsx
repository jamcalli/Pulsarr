import type { ReactNode } from 'react'
import { FactList } from '@/components/fact-list'
import { StatusPill } from '@/components/status-pill'
import { Badge } from '@/components/ui/badge'
import { AccordionCard } from '@/features/library/components/accordion-card'
import type { InstanceCardSummary } from '@/lib/arr/instance-summary'

interface InstanceCardProps {
  value: number | 'new'
  summary: InstanceCardSummary
  open: boolean
  onToggle: () => void
  children?: ReactNode
}

export function InstanceCard({
  value,
  summary,
  open,
  onToggle,
  children,
}: InstanceCardProps) {
  return (
    <AccordionCard
      value={value}
      title={summary.name}
      badges={summary.isDefault && <Badge variant="secondary">Default</Badge>}
      trailing={
        summary.status && (
          <StatusPill tone={summary.status.tone} label={summary.status.label} />
        )
      }
      summary={
        summary.url && (
          <span className="break-all text-muted-foreground">{summary.url}</span>
        )
      }
      footer={summary.facts.length > 0 && <FactList facts={summary.facts} />}
      open={open}
      onToggle={onToggle}
    >
      {children}
    </AccordionCard>
  )
}
