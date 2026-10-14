import type { ReactNode } from 'react'
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'

interface FieldSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export function FieldSection({
  title,
  description,
  children,
}: FieldSectionProps) {
  return (
    <FieldSet className="gap-3">
      <FieldLegend className={description ? 'mb-2.5' : undefined}>
        {title}
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldGroup className="gap-4">{children}</FieldGroup>
    </FieldSet>
  )
}
