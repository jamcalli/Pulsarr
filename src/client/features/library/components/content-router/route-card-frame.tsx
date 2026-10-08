import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function RouteCardFrame({ children }: { children: ReactNode }) {
  return (
    <Card className="px-(--card-spacing) max-md:[--card-spacing:--spacing(4)]">
      {children}
    </Card>
  )
}
