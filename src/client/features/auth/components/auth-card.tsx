import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface AuthCardProps {
  title: string
  description?: string
  children: ReactNode
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="w-full max-w-sm px-4">
      <Card>
        <CardHeader>
          <h1 className="font-heading text-xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </CardHeader>
        <CardContent className="gap-6">
          {children}
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
