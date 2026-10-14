import type { ReactNode } from 'react'
import { SelectContent, SelectGroup, SelectLabel } from '@/components/ui/select'

/** A select's dropdown, headed by what the select chooses. */
export function SelectList({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <SelectContent>
      <SelectGroup>
        <SelectLabel>{label}</SelectLabel>
        {children}
      </SelectGroup>
    </SelectContent>
  )
}
