import type { ReactElement, ReactNode } from 'react'
import { ActionGroup } from '@/components/action-group'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'

export interface ActionProgress {
  name: string
  percent: number
  message?: string
}

interface ActionRowButton {
  buttonLabel: string
  busyLabel: string
  variant?: 'default' | 'destructive'
  disabled: boolean
  onRun: () => void
  actions?: never
}

interface ActionRowActions {
  /** Buttons the caller draws itself, for a primary action or more than one. */
  actions: ReactElement | ReactElement[]
  buttonLabel?: never
  busyLabel?: never
  variant?: never
  disabled?: never
  onRun?: never
}

type ActionRowProps = (ActionRowButton | ActionRowActions) & {
  title: string
  description: string
  running: boolean
  unavailableReason?: string | null
  progress?: ActionProgress[]
  result?: ReactNode
  /** Shown in place of `result` and kept while running, for a run that reports each step. */
  live?: ReactNode
  errorMessage?: string | null
}

export function ActionRow({
  title,
  description,
  running,
  unavailableReason = null,
  progress,
  result,
  live,
  errorMessage = null,
  ...action
}: ActionRowProps) {
  const visibleProgress = running ? (progress ?? []) : []

  return (
    <div className="flex flex-col gap-3">
      <Item className="p-0">
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          <ItemDescription className="line-clamp-none">
            {description}
          </ItemDescription>
          {unavailableReason && (
            <ItemDescription className="line-clamp-none">
              {unavailableReason}
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions className="max-md:w-full">
          <ActionGroup>
            {action.actions ?? (
              <Button
                type="button"
                variant={
                  action.variant === 'destructive' ? 'destructive' : 'outline'
                }
                size="sm"
                disabled={action.disabled || running}
                onClick={action.onRun}
              >
                {running ? action.busyLabel : action.buttonLabel}
              </Button>
            )}
          </ActionGroup>
        </ItemActions>
      </Item>
      {visibleProgress.length > 0 && (
        <div className="grid grid-cols-[4rem_1fr_3rem] items-center gap-x-3 gap-y-1 text-xs">
          {visibleProgress.map(({ name, percent, message }) => (
            <div key={name} className="col-span-full grid grid-cols-subgrid">
              <span className="font-medium">{name}</span>
              <Progress value={percent} aria-label={`${name} progress`} />
              <span className="text-right text-muted-foreground tabular-nums">
                {percent}%
              </span>
              {message && (
                <p className="col-start-2 col-span-2 text-muted-foreground">
                  {message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {live ?? (!running && result)}
      <ErrorAlert message={errorMessage} />
    </div>
  )
}
