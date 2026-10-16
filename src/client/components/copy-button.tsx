import { Check, Copy } from 'lucide-react'
import { InputGroupButton } from '@/components/ui/input-group'
import { COPIED_LABEL, useCopyFeedback } from '@/hooks/useCopyFeedback'

interface CopyButtonProps {
  value: string
  label: string
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const { copied, copy } = useCopyFeedback()

  return (
    <InputGroupButton
      size="icon-xs"
      aria-label={copied ? COPIED_LABEL : label}
      onClick={() => copy(value)}
    >
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  )
}
