import { Children, type ReactNode } from 'react'
import { LockLine } from '@/components/settings/lock-line'
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
      <LockLine key="lock" reason={lock.reason} action={lock.action} />,
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
