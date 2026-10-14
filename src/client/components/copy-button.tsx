import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InputGroupButton } from '@/components/ui/input-group'
import { copyText } from '@/lib/clipboard'
import { COPY_FEEDBACK_DELAY } from '@/lib/constants'

interface CopyButtonProps {
  value: string
  label: string
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_DELAY)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <InputGroupButton
      size="icon-xs"
      aria-label={copied ? 'Copied' : label}
      onClick={async () => setCopied(await copyText(value))}
    >
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  )
}
