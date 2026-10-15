import type { ReactNode } from 'react'
import { CopyButton } from '@/components/copy-button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

interface CopyInputProps {
  value: string
  copyLabel: string
  id?: string
  'aria-label'?: string
  masked?: boolean
  className?: string
  /** Buttons drawn before the copy button, such as a reveal toggle for a masked value. */
  children?: ReactNode
}

export function CopyInput({
  value,
  copyLabel,
  id,
  'aria-label': ariaLabel,
  masked = false,
  className,
  children,
}: CopyInputProps) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        id={id}
        readOnly
        type={masked ? 'password' : 'text'}
        autoComplete="off"
        value={value}
        aria-label={ariaLabel}
        className="font-mono"
      />
      <InputGroupAddon align="inline-end">
        {children}
        <CopyButton value={value} label={copyLabel} />
      </InputGroupAddon>
    </InputGroup>
  )
}
