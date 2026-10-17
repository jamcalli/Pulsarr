import { cn } from 'cn'
import type { ReactNode } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format'
import type { components } from '@/types/api.js'

export type ConnectionTestStatus = 'idle' | 'testing' | 'passed' | 'failed'

export interface ConnectionTestFailure {
  title: string
  message: string
}

/** A request that never reached the target fails with its error alone. */
export type InlineTestOutcome =
  | components['schemas']['TestResult']
  | { success: false; error: string }

interface InlineProps {
  size: 'inline'
  testing: boolean
  outcome: InlineTestOutcome | null
}

interface DefaultProps {
  size?: 'default'
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

const FAILED_FALLBACK = 'The test did not go through.'

function sentDetail(outcome: components['schemas']['TestResult']): string {
  const status =
    outcome.statusCode === undefined ? '' : `HTTP ${outcome.statusCode}, `
  return `${status}in ${formatDuration(outcome.responseTime)}`
}

function InlineResult({ testing, outcome }: Omit<InlineProps, 'size'>) {
  if (testing) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Sending a test...
      </p>
    )
  }
  if (!outcome) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm"
    >
      <StatusPill
        tone={outcome.success ? 'on' : 'failed'}
        label={outcome.success ? 'Sent' : 'Failed'}
      />
      <span
        className={cn(
          'min-w-0 flex-1 basis-48 wrap-anywhere',
          outcome.success && 'text-muted-foreground',
        )}
      >
        {outcome.success
          ? sentDetail(outcome)
          : (outcome.error ?? FAILED_FALLBACK)}
      </span>
    </div>
  )
}

export function ConnectionTest(props: InlineProps | DefaultProps) {
  if (props.size === 'inline') return <InlineResult {...props} />
  const {
    status,
    failure,
    onTest,
    disabled,
    disabledReason = null,
    passedDetail,
    children,
  } = props
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
