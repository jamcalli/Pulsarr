import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import {
  type SummaryToken,
  type SummaryTokenKind,
  tokensSentence,
} from '@/features/library/lib/content-router/rule-summary'

const TEXT_CLASS: Record<Exclude<SummaryTokenKind, 'value' | 'not'>, string> = {
  field: 'font-bold',
  operator: 'text-muted-foreground',
  join: 'font-bold',
  paren: 'text-base font-bold text-muted-foreground',
}

export function RuleTokens({ tokens }: { tokens: readonly SummaryToken[] }) {
  const sentence = tokensSentence(tokens)
  if (tokens.length === 0) {
    return <span className="text-sm text-muted-foreground">{sentence}</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span className="sr-only">{sentence}</span>
      {tokens.map((token, index) =>
        token.kind === 'value' || token.kind === 'not' ? (
          <Badge
            key={index}
            aria-hidden
            variant="secondary"
            className={cn(
              token.kind === 'value' &&
                'h-auto min-h-6 shrink whitespace-normal break-words',
            )}
          >
            {token.text}
          </Badge>
        ) : (
          <span
            key={index}
            aria-hidden
            className={cn('break-words', TEXT_CLASS[token.kind])}
          >
            {token.text}
          </span>
        ),
      )}
    </span>
  )
}
