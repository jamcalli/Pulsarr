import { X } from 'lucide-react'
import { useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { OptionLabel } from '@/components/form/option-label'
import { ActionRow } from '@/components/settings/action-row'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { FieldError } from '@/components/ui/field'
import { InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { useDiscordDmTest } from '@/features/notifications/hooks/discord/useDiscordDmTest'
import { useDiscordRecipients } from '@/features/notifications/hooks/discord/useDiscordRecipients'
import {
  dmUnavailableReason,
  matchRecipients,
} from '@/features/notifications/lib/discord-bot'
import { useDiscordBotStatus } from '@/hooks/useDiscordBotStatus'

const DM_ID_ERROR_ID = 'discord-dm-id-error'
// Base UI sends input-clear on blur when nothing is picked, which would drop a typed Discord ID.
const TEXT_CHANGE_REASONS = new Set<string>([
  'input-change',
  'item-press',
  'clear-press',
])

export function TestDirectMessage() {
  const status = useDiscordBotStatus()
  const dm = useDiscordDmTest()
  const recipients = useDiscordRecipients()
  const unavailableReason = dmUnavailableReason(status)
  const blocked = unavailableReason !== null
  const nameFor = (discordId: string) =>
    recipients.find((recipient) => recipient.discordId === discordId)?.name ??
    discordId
  const pickedLabel = dm.picked === null ? null : nameFor(dm.picked)
  const noRecipients = recipients.length === 0
  const hasEntry = dm.text !== '' || dm.picked !== null
  const matches = matchRecipients(recipients, dm.text, dm.picked !== null)
  const [wantsOpen, setWantsOpen] = useState(false)
  const open = wantsOpen && (noRecipients || matches.length > 0)

  return (
    <ActionRow
      title="Send a test direct message"
      description="Messages one Discord user through the bot."
      running={dm.testing}
      unavailableReason={unavailableReason}
      actions={
        <div className="flex gap-2">
          <Combobox
            items={recipients.map((recipient) => recipient.discordId)}
            filteredItems={matches.map((recipient) => recipient.discordId)}
            open={open}
            onOpenChange={setWantsOpen}
            itemToStringLabel={nameFor}
            value={dm.picked}
            onValueChange={dm.pick}
            inputValue={dm.text}
            onInputValueChange={(next, details) => {
              if (TEXT_CHANGE_REASONS.has(details.reason)) {
                dm.type(next, pickedLabel)
              }
            }}
            disabled={blocked}
          >
            <ComboboxInput
              aria-label="Send to"
              showTrigger={!hasEntry}
              placeholder="Pick a user or type a Discord ID"
              autoComplete="off"
              disabled={blocked}
              onBlur={dm.blur}
              aria-invalid={dm.idError !== null}
              aria-describedby={dm.idError ? DM_ID_ERROR_ID : undefined}
              className="min-w-0 flex-1 md:w-72"
            >
              {hasEntry && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear"
                    onClick={dm.clear}
                  >
                    <X aria-hidden />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </ComboboxInput>
            <ComboboxContent>
              {noRecipients && (
                <ComboboxEmpty>No users have a Discord ID saved.</ComboboxEmpty>
              )}
              <ComboboxList>
                {(discordId: string) => (
                  <ComboboxItem key={discordId} value={discordId}>
                    <OptionLabel description={discordId}>
                      {nameFor(discordId)}
                    </OptionLabel>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <Button
            type="button"
            variant="neutral"
            disabled={blocked || !dm.valid || dm.testing}
            onClick={dm.send}
          >
            <BusyLabel
              busy={dm.testing}
              label="Send test"
              busyLabel="Sending..."
            />
          </Button>
        </div>
      }
      result={
        <>
          {dm.idError && (
            <FieldError
              id={DM_ID_ERROR_ID}
              errors={[{ message: dm.idError }]}
            />
          )}
          <ConnectionTest size="inline" testing={false} outcome={dm.outcome} />
        </>
      }
      live={
        dm.testing ? (
          <ConnectionTest size="inline" testing outcome={null} />
        ) : undefined
      }
    />
  )
}
