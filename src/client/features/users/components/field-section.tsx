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
      <div className="flex flex-col gap-1">
        <FieldLegend className="mb-0">{title}</FieldLegend>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
      <FieldGroup className="gap-4">{children}</FieldGroup>
    </FieldSet>
  )
}
