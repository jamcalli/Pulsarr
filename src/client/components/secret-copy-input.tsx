import { useState } from 'react'
import { CopyInput } from '@/components/copy-input'
import { SecretRevealButton } from '@/components/form/secret-reveal-button'

interface SecretCopyInputProps {
  value: string
  copyLabel: string
  revealLabel: { show: string; hide: string }
  id?: string
  'aria-label'?: string
  className?: string
}

/** A read-only secret, masked until revealed, that copies while masked. */
export function SecretCopyInput({
  value,
  copyLabel,
  revealLabel,
  id,
  'aria-label': ariaLabel,
  className,
}: SecretCopyInputProps) {
  const [shown, setShown] = useState(false)

  return (
    <CopyInput
      id={id}
      value={value}
      copyLabel={copyLabel}
      aria-label={ariaLabel}
      masked={!shown}
      className={className}
    >
      <SecretRevealButton
        shown={shown}
        onToggle={() => setShown(!shown)}
        revealLabel={revealLabel}
      />
    </CopyInput>
  )
}
