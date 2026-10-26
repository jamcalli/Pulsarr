import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'

/** Opens in a new tab, for docs and other pages outside Pulsarr. */
export function ExternalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'link' })}
    >
      {children}
    </a>
  )
}
