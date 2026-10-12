import { useRef } from 'react'
import { useFieldContext } from '@/lib/form-context'

/** Opening a popup moves focus into it, so only a blur while closed or the close itself counts as leaving the field. */
export function usePopupBlur() {
  const field = useFieldContext()
  const open = useRef(false)
  return {
    onOpenChange: (next: boolean) => {
      open.current = next
      if (!next) field.handleBlur()
    },
    onBlur: () => {
      if (!open.current) field.handleBlur()
    },
  }
}
