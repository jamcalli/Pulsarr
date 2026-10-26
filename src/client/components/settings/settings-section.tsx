import { Children, type ReactNode, use } from 'react'
import { BlockTitle } from '@/components/settings/block-title'
import { LockLine } from '@/components/settings/lock-line'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { SettingsSurfaceContext } from '@/lib/settings-surface'

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

  const separated = rows.flatMap((row, index) =>
    index === 0 ? [row] : [<FieldSeparator key={`separator-${index}`} />, row],
  )
  const surface = use(SettingsSurfaceContext)

  if (surface === 'rows') {
    return <FieldGroup className="gap-3.5">{separated}</FieldGroup>
  }

  if (surface === 'flat') {
    return (
      <section
        className="flex flex-col gap-3.5 [[data-flat-section]+&]:border-t [[data-flat-section]+&]:border-divider [[data-flat-section]+&]:pt-5"
        data-flat-section
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <BlockTitle>{title}</BlockTitle>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
        <FieldGroup className="gap-3.5">{separated}</FieldGroup>
      </section>
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
        {separated}
      </FieldGroup>
    </Card>
  )
}
