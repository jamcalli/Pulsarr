import type { ReactNode } from 'react'

export function BlockTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-heading font-bold">{children}</h3>
}
