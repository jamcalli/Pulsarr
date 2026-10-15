import type { ReactNode } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'

export type ConnectionTestStatus = 'idle' | 'testing' | 'passed' | 'failed'

export interface ConnectionTestFailure {
  title: string
  message: string
}

interface ConnectionTestProps {
  status: ConnectionTestStatus
  failure: ConnectionTestFailure | null
  onTest: () => void
  disabled: boolean
  /** Why the test can't run right now, shown under the button while disabled. */
  disabledReason?: string | null
  /** What the passed test reached, shown beside Connected. */
  passedDetail?: string
  children?: ReactNode
}

export function ConnectionTest({
  status,
  failure,
  onTest,
  disabled,
  disabledReason = null,
  passedDetail,
  children,
}: ConnectionTestProps) {
  const testing = status === 'testing'

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="neutral"
        size="sm"
        disabled={disabled || testing}
        onClick={onTest}
      >
        <BusyLabel
          busy={testing}
          label="Test connection"
          busyLabel="Testing..."
        />
      </Button>
      {disabled && disabledReason && (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      )}
      {testing && (
        <p role="status" className="text-sm text-muted-foreground">
          Testing the connection...
        </p>
      )}
      {status === 'passed' && (
        <div role="status">
          <StatusPill tone="on" label="Connected" detail={passedDetail} />
        </div>
      )}
      {status === 'failed' && failure && (
        <ErrorAlert message={failure.title} detail={failure.message}>
          {children}
        </ErrorAlert>
      )}
    </div>
  )
}
