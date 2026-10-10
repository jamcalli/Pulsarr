import type { ReactNode } from 'react'
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

interface ActionRowProps {
  title: string
  description: string
  buttonLabel: string
  busyLabel: string
  variant?: 'default' | 'destructive'
  disabled: boolean
  running: boolean
  onRun: () => void
  unavailableReason?: string | null
  progress?: ActionProgress[]
  result?: ReactNode
  errorMessage?: string | null
}

export function ActionRow({
  title,
  description,
  buttonLabel,
  busyLabel,
  variant = 'default',
  disabled,
  running,
  onRun,
  unavailableReason = null,
  progress,
  result,
  errorMessage = null,
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
        <ItemActions>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'outline'}
            size="sm"
            disabled={disabled || running}
            onClick={onRun}
          >
            {running ? busyLabel : buttonLabel}
          </Button>
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
      {!running && result}
      <ErrorAlert message={errorMessage} />
    </div>
  )
}
