import type { ReactNode } from 'react'
import { ErrorAlert } from '@/components/error-alert'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlexPin } from '@/hooks/plex/usePlexPin'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatTime } from '@/lib/format'
import { plexLinkHref, spokenCode } from '@/lib/plex/plex-pin'
import type { components } from '@/types/api.js'

const QR_FRAME = 'aspect-square w-full rounded-md border-2 border-border'
const DESKTOP_GRID = 'grid grid-cols-[10.5rem_minmax(0,1fr)] gap-6'

interface PinLinkPanelProps {
  active: boolean
  onLinked: () => void
  /** Wraps the panel for a host that hides its footer and blocks close while the approved token links. */
  children?: (panel: { body: ReactNode; approved: boolean }) => ReactNode
}

function WaitingBody({
  pin,
  phone,
}: {
  pin: components['schemas']['PlexPin']
  phone: boolean
}) {
  const link = (
    <Button
      variant="plex"
      className={phone ? 'w-full' : 'self-start'}
      nativeButton={false}
      render={
        <a
          href={plexLinkHref(pin.code)}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      Open plex.tv/link
    </Button>
  )
  const lead = phone
    ? 'Or enter this code at plex.tv/link on another device.'
    : 'Scan the code, or enter this code at plex.tv/link.'
  const code = (
    <span>
      <span
        aria-hidden
        className="font-mono text-3xl font-bold tracking-widest"
      >
        {pin.code}
      </span>
      <span className="sr-only">{spokenCode(pin.code)}</span>
    </span>
  )
  const waiting = (
    <p role="status" aria-live="polite" className="flex flex-col text-sm">
      <span>Waiting for you to approve it on Plex...</span>
      <span className="text-muted-foreground">
        The code expires at {formatTime(new Date(pin.expiresAt))}.
      </span>
    </p>
  )

  if (phone) {
    return (
      <div className="flex w-full flex-col items-center gap-3 text-center">
        {link}
        <span className="text-sm text-muted-foreground">{lead}</span>
        {code}
        {waiting}
      </div>
    )
  }
  return (
    <div className={DESKTOP_GRID}>
      <div className={`${QR_FRAME} overflow-hidden bg-card`}>
        <img
          src={pin.qr}
          alt="QR code for plex.tv/link with the code filled in"
          className="aspect-square size-full object-contain"
        />
      </div>
      <div className="flex flex-col items-start gap-3">
        <span className="text-sm text-muted-foreground">{lead}</span>
        {code}
        {link}
        {waiting}
      </div>
    </div>
  )
}

function CreatingBody({ phone }: { phone: boolean }) {
  const status = (
    <span role="status" className="sr-only">
      Asking Plex for a code...
    </span>
  )
  if (phone) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        {status}
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-60" />
      </div>
    )
  }
  return (
    <div className={`${DESKTOP_GRID} w-full`}>
      {status}
      <Skeleton className={QR_FRAME} />
      <div className="flex flex-col items-start gap-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-60" />
      </div>
    </div>
  )
}

export function PinLinkPanel({
  active,
  onLinked,
  children,
}: PinLinkPanelProps) {
  const phone = useIsMobile()
  const pin = usePlexPin(active, onLinked)
  const approved = pin.phase === 'approved'

  const body = (
    <>
      {pin.phase === 'creating' && <CreatingBody phone={phone} />}
      {pin.phase === 'waiting' && pin.pin && (
        <WaitingBody pin={pin.pin} phone={phone} />
      )}
      {approved && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <StatusPill tone="on" label="Approved" />
          Linking your account...
        </p>
      )}
      {pin.phase === 'expired' && (
        <>
          <p role="status" className="text-sm">
            This code expired before it was approved.
          </p>
          <Button type="button" onClick={pin.newCode}>
            Get a new code
          </Button>
        </>
      )}
      {pin.phase === 'failed' && pin.failure && (
        <>
          <ErrorAlert message={pin.failure.title} detail={pin.failure.detail} />
          <Button type="button" onClick={pin.newCode}>
            Try again
          </Button>
        </>
      )}
    </>
  )

  return children ? children({ body, approved }) : body
}
