import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function RouteNotice({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <div className="w-full max-w-sm px-4">
      <Card>
        <CardHeader>
          <h1 className="font-heading text-xl font-bold">{title}</h1>
        </CardHeader>
        <CardContent className="gap-6">
          <p className="text-muted-foreground">{description}</p>
          <div className="flex flex-wrap gap-2">{children}</div>
        </CardContent>
      </Card>
    </div>
  )
}
