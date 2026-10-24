import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { useConfig } from '@/hooks/useConfig'
import { useShowLoading } from '@/hooks/useMinLoading'
import { type ScheduleStatus, useSchedule } from '@/hooks/useSchedule'
import type { OperationMeta } from '@/lib/operation-toasts'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

interface ScheduledJob {
  schedule: ScheduleStatus
  run: ReturnType<typeof useSchedule>['run']
}

interface GateCopy {
  section: string
  title: string
  description: string
  skeleton: ReactNode
}

interface ConfigOnlyProps extends GateCopy {
  schedule?: undefined
  children: (config: Config) => ReactNode
}

interface ScheduledProps extends GateCopy {
  /** The scheduler job loaded alongside the config. */
  schedule: { name: string; meta: OperationMeta }
  children: (config: Config, job: ScheduledJob) => ReactNode
}

interface GateViewProps extends GateCopy {
  loaded: boolean
  error: string | null
  onRetry: () => void
  content: ReactNode
}

function GateView({
  section,
  title,
  description,
  skeleton,
  loaded,
  error,
  onRetry,
  content,
}: GateViewProps) {
  const showLoading = useShowLoading(!loaded)

  if (error) {
    return (
      <Page>
        <PageHeader section={section} title={title} description={description} />
        <RetryAlert message={error} onRetry={onRetry} />
      </Page>
    )
  }
  if (showLoading) return skeleton
  return content
}

function ConfigGate({ children, ...copy }: ConfigOnlyProps) {
  const { config, error, initialize } = useConfig()

  return (
    <GateView
      {...copy}
      loaded={config !== null}
      error={config ? null : error}
      onRetry={() => initialize(true)}
      content={config ? children(config) : null}
    />
  )
}

function ScheduledGate({ schedule, children, ...copy }: ScheduledProps) {
  const { config, error, initialize } = useConfig()
  const job = useSchedule(schedule.name, schedule.meta)
  const loadError =
    (!config && error) || (!job.schedule && job.errorMessage) || null

  return (
    <GateView
      {...copy}
      loaded={config !== null && job.schedule !== null}
      error={loadError}
      onRetry={() => {
        if (!config) initialize(true)
        if (!job.schedule) job.retry()
      }}
      content={
        config && job.schedule
          ? children(config, { schedule: job.schedule, run: job.run })
          : null
      }
    />
  )
}

export function ConfigPageGate(props: ConfigOnlyProps | ScheduledProps) {
  if (props.schedule) return <ScheduledGate {...props} />
  return <ConfigGate {...props} />
}
