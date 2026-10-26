import { Spinner } from '@/components/ui/spinner'

interface BusyLabelProps {
  busy: boolean
  label: string
  busyLabel?: string
}

export function BusyLabel({ busy, label, busyLabel }: BusyLabelProps) {
  if (!busy) return label
  return (
    <>
      <Spinner data-icon="inline-start" aria-hidden />
      {busyLabel ?? label}
    </>
  )
}
