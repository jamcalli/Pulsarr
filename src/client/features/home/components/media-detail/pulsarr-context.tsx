import { cn } from 'cn'
import {
  Check,
  Clock,
  Film,
  Loader,
  type LucideIcon,
  Minus,
  Tv,
} from 'lucide-react'
import { PersonPill } from '@/components/person-pill'
import { RequestStatus } from '@/features/home/components/request-status'
import type {
  JourneyStep,
  MediaContext,
  StepState,
} from '@/features/home/lib/media-context'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatCount } from '@/lib/format'

const STEP_STYLES: Record<StepState, { icon: LucideIcon; className: string }> =
  {
    done: {
      icon: Check,
      className: 'bg-status-available text-primary-foreground',
    },
    waiting: {
      icon: Clock,
      className: 'bg-status-pending text-primary-foreground',
    },
    progress: {
      icon: Loader,
      className: 'bg-status-requested text-primary-foreground',
    },
    todo: {
      icon: Minus,
      className: 'border-dashed bg-card text-muted-foreground',
    },
  }

function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step) => {
        const { icon: Icon, className } = STEP_STYLES[step.state]
        return (
          <li
            key={step.label}
            className="relative flex gap-3 pb-4 last:pb-0 not-last:before:absolute not-last:before:top-7 not-last:before:bottom-0 not-last:before:left-3.5 not-last:before:w-0.5 not-last:before:-translate-x-1/2 not-last:before:bg-border"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border',
                className,
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col pt-0.5">
              <span className="font-bold">{step.label}</span>
              {step.detail && (
                <span className="text-xs text-muted-foreground">
                  {step.detail}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function PulsarrContext({ context }: { context: MediaContext }) {
  const { journey, instances, watchers } = context
  const lookup = useUserDirectory()
  const empty = journey === null && watchers.length === 0
  const watcherPeople = watchers.map((username) => ({
    username,
    ...lookup(username),
  }))

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border-2 border-border p-4">
      <h3 className="font-heading font-bold">In Pulsarr</h3>
      {empty && (
        <p className="text-muted-foreground">
          Nobody has requested or watchlisted this yet.
        </p>
      )}
      {journey && <Journey steps={journey} />}
      {instances.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-muted-foreground">Instances</h4>
          <ul className="flex flex-col gap-2">
            {instances.map((instance) => {
              const Icon = instance.instanceType === 'radarr' ? Film : Tv
              return (
                <li
                  key={`${instance.instanceType}-${instance.id}`}
                  className="flex items-center gap-2"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {instance.name}
                  </span>
                  <RequestStatus status={instance.status} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {watchers.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-muted-foreground">
            On {formatCount(watchers.length, 'watchlist')}
          </h4>
          <ul className="flex flex-wrap gap-2">
            {watcherPeople.map((person) => (
              <li key={person.username}>
                <PersonPill name={person.name} avatar={person.avatar} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
