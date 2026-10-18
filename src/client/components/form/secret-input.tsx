import { type ComponentProps, useState } from 'react'
import { SecretRevealButton } from '@/components/form/secret-reveal-button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

type SecretInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  'type' | 'value'
> & {
  value: string
  /** Accessible names for the toggle, which is disabled while the value is blank. */
  revealLabel: { show: string; hide: string }
  groupClassName?: string
}

export function SecretInput({
  value,
  revealLabel,
  groupClassName,
  disabled,
  ...inputProps
}: SecretInputProps) {
  const [revealed, setRevealed] = useState(false)
  const hasValue = value.trim() !== ''
  const shown = revealed && hasValue

  return (
    <InputGroup className={groupClassName}>
      <InputGroupInput
        {...inputProps}
        value={value}
        disabled={disabled}
        type={shown ? 'text' : 'password'}
      />
      <InputGroupAddon align="inline-end">
        <SecretRevealButton
          shown={shown}
          onToggle={() => setRevealed(!shown)}
          disabled={disabled || !hasValue}
          revealLabel={revealLabel}
        />
      </InputGroupAddon>
    </InputGroup>
  )
}
