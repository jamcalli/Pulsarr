import { Trash2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'

export function DeleteButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant'>) {
  return (
    <Button type="button" variant="ghost" {...props}>
      <Trash2
        data-icon="inline-start"
        aria-hidden
        className="text-destructive-text"
      />
      {children}
    </Button>
  )
}
