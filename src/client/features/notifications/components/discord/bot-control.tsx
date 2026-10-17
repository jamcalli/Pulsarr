import { BusyLabel } from '@/components/busy-label'
import { LockLine } from '@/components/settings/lock-line'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { useDiscordBotControl } from '@/features/notifications/hooks/discord/useDiscordBotControl'
import { BOT_STATUS_PILLS } from '@/features/notifications/lib/discord-bot'
import { useDiscordBotStatus } from '@/hooks/useDiscordBotStatus'
import type { components } from '@/types/api.js'

export function BotControl({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const status = useDiscordBotStatus()
  const control = useDiscordBotControl()
  const canStop = status === 'running' || status === 'starting'
  const credentialsSaved = Boolean(
    config.discordBotToken && config.discordClientId,
  )
  const startReason =
    !canStop && !credentialsSaved
      ? 'Save a bot token and client ID first.'
      : null
  const canStart = status === 'stopped' && credentialsSaved
  const pill = status ? BOT_STATUS_PILLS[status] : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {pill && <StatusPill tone={pill.tone} label={pill.label} live />}
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={control.pending || !(canStop || canStart)}
          onClick={canStop ? control.stop : control.start}
        >
          <BusyLabel
            busy={control.pending}
            label={canStop ? 'Stop bot' : 'Start bot'}
            busyLabel={canStop ? 'Stopping...' : 'Starting...'}
          />
        </Button>
      </div>
      {startReason && <LockLine reason={startReason} />}
      {control.errorMessage && (
        <span role="alert" className="text-xs text-destructive-text">
          {control.errorMessage}
        </span>
      )}
    </div>
  )
}
