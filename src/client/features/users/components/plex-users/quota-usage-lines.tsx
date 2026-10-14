import { QuotaLimitPill } from '@/features/users/components/quota-limit-pill'
import {
  type PlexUserRow,
  quotaLines,
} from '@/features/users/lib/plex-users/user-rows'

export function QuotaUsageLines({ quotas }: { quotas: PlexUserRow['quotas'] }) {
  const lines = quotaLines(quotas)
  if (lines.length === 0) {
    return <span className="text-muted-foreground">None</span>
  }
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => (
        <div key={line.key} className="flex flex-wrap items-center gap-x-2">
          <span className="tabular-nums">{line.usage}</span>
          <span className="text-muted-foreground">{line.period}</span>
          {line.atLimit && <QuotaLimitPill />}
        </div>
      ))}
    </div>
  )
}
