import { cn } from 'cn'
import type { MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { linkUnderline } from '@/components/ui/button'

interface InlineLinkProps {
  to: string
  children: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

/** A navigation link that inherits the surrounding text size and weight. */
export function InlineLink({
  to,
  children,
  className,
  onClick,
}: InlineLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        linkUnderline,
        'outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0',
        className,
      )}
    >
      {children}
    </Link>
  )
}
