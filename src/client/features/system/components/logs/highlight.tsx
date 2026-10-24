import { splitMatches } from '@/features/system/lib/logs/log-filter'

/** `needle` must be lowercased, as `searchNeedle` returns it. */
export function Highlight({
  text,
  needle,
}: {
  text: string
  needle: string | null
}) {
  if (needle === null) return text
  return splitMatches(text, needle).map((part) =>
    part.match ? (
      <mark
        key={part.start}
        className="rounded-xs bg-gold text-primary-foreground"
      >
        {part.text}
      </mark>
    ) : (
      <span key={part.start}>{part.text}</span>
    ),
  )
}
