import { Eye, EyeOff } from 'lucide-react'
import { InputGroupButton } from '@/components/ui/input-group'

interface SecretRevealButtonProps {
  shown: boolean
  onToggle: () => void
  disabled?: boolean
  revealLabel: { show: string; hide: string }
}

export function SecretRevealButton({
  shown,
  onToggle,
  disabled,
  revealLabel,
}: SecretRevealButtonProps) {
  return (
    <InputGroupButton
      size="icon-xs"
      aria-label={shown ? revealLabel.hide : revealLabel.show}
      aria-pressed={shown}
      disabled={disabled}
      onClick={onToggle}
    >
      {shown ? <EyeOff /> : <Eye />}
    </InputGroupButton>
  )
}
