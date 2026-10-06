import type { ReactNode } from 'react'
import { PosterFrame } from '@/components/poster-frame'
import { useIntent } from '@/hooks/useIntent'

interface PosterCardProps {
  title: string
  subtitle?: ReactNode
  thumb: string | null
  type: 'movie' | 'show'
  status?: ReactNode
  onSelect?: () => void
  onIntent?: () => void
}

export function PosterCard({
  title,
  subtitle,
  thumb,
  type,
  status,
  onSelect,
  onIntent,
}: PosterCardProps) {
  const intent = useIntent(onIntent)
  const body = (
    <>
      <div className="relative">
        <PosterFrame thumb={thumb} type={type} />
        {status && (
          <div className="absolute top-0 left-0 *:rounded-none *:rounded-tl-md *:rounded-br-md">
            {status}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-2 font-medium">{title}</span>
        {subtitle && (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        {...intent}
        className="flex flex-col gap-2 rounded-md text-left outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
      >
        {body}
      </button>
    )
  }
  return <div className="flex flex-col gap-2">{body}</div>
}
