import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'

export interface SettingsLock {
  reason: string
  action?: ReactNode
}

interface SettingsSectionProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  lock?: SettingsLock
  children: ReactNode
}

export function SettingsSection({
  title,
  description,
  action,
  lock,
  children,
}: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <FieldGroup className="gap-0 divide-y divide-divider *:px-(--card-spacing) *:py-4 *:first:pt-0 *:last:pb-0">
        {lock && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            <span className="flex-1">{lock.reason}</span>
            {lock.action}
          </div>
        )}
        {children}
      </FieldGroup>
    </Card>
  )
}
