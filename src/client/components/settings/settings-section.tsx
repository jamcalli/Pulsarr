import { Lock } from 'lucide-react'
import { Children, type ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'

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
  const rows = Children.toArray(children)
  if (lock) {
    rows.unshift(
      <div key="lock" className="flex items-center gap-2 text-muted-foreground">
        <Lock className="size-4 shrink-0" />
        <span className="flex-1">{lock.reason}</span>
        {lock.action}
      </div>,
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <FieldGroup className="gap-3.5 *:px-(--card-spacing)">
        {rows.flatMap((row, index) =>
          index === 0
            ? [row]
            : [<FieldSeparator key={`separator-${index}`} />, row],
        )}
      </FieldGroup>
    </Card>
  )
}
