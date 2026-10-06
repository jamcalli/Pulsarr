import { Loader2 } from 'lucide-react'

interface BusyLabelProps {
  busy: boolean
  label: string
  busyLabel?: string
}

export function BusyLabel({ busy, label, busyLabel }: BusyLabelProps) {
  if (!busy) return label
  return (
    <>
      <Loader2 className="animate-spin" data-icon="inline-start" />
      {busyLabel ?? label}
    </>
  )
}
