import { Badge } from '@/components/ui/badge'
import { CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

interface CardTitleCountProps {
  title: string
  /** The badge hides at zero. */
  count: number
  tone?: 'neutral' | 'pending'
}

/** Pairs with `CardHeaderSkeleton badge`. */
export function CardTitleCount({
  title,
  count,
  tone = 'neutral',
}: CardTitleCountProps) {
  return (
    <CardTitle className="flex items-center gap-2">
      {title}
      {count > 0 && (
        <Badge
          variant={tone === 'pending' ? 'warn' : 'secondary'}
          className="tabular-nums"
        >
          {formatNumber(count)}
        </Badge>
      )}
    </CardTitle>
  )
}
