import { StatusPill } from '@/components/status-pill'

export function EnabledPill({ on, detail }: { on: boolean; detail?: string }) {
  return (
    <StatusPill
      tone={on ? 'on' : 'off'}
      label={on ? 'Enabled' : 'Disabled'}
      detail={detail}
    />
  )
}
