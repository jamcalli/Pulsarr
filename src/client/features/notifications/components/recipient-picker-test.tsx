import { X } from 'lucide-react'
import { useId, useState } from 'react'
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
import type { RecipientTest } from '@/features/notifications/hooks/useRecipientTest'
import {
  matchRecipients,
  type Recipient,
} from '@/features/notifications/lib/recipients'

// Base UI sends input-clear on blur when nothing is picked, which would drop a typed id.
const TEXT_CHANGE_REASONS = new Set<string>([
  'input-change',
  'item-press',
  'clear-press',
])

/** With `typedIds`, recipient ids show under names, match the search and survive blur as typed text. */
export function RecipientPickerTest<Id extends string | number>({
  title,
  description,
  recipients,
  test,
  placeholder,
  emptyText,
  typedIds = false,
  unavailableReason,
  disabled = false,
}: {
  title: string
  description: string
  recipients: readonly Recipient<Id>[]
  test: RecipientTest<Id>
  placeholder: string
  emptyText: string
  typedIds?: boolean
  unavailableReason: string | null
  disabled?: boolean
}) {
  const errorId = useId()
  const blocked = disabled || unavailableReason !== null
  const nameFor = (id: Id) =>
    recipients.find((recipient) => recipient.id === id)?.name ?? String(id)
  const pickedLabel = test.picked === null ? null : nameFor(test.picked)
  const noRecipients = recipients.length === 0
  const hasEntry = test.text !== '' || test.picked !== null
  const matches = matchRecipients(
    recipients,
    test.text,
    test.picked !== null,
    typedIds ? (recipient) => String(recipient.id) : undefined,
  )
  const [wantsOpen, setWantsOpen] = useState(false)
  const open = wantsOpen && (noRecipients || matches.length > 0)

  return (
    <ActionRow
      title={title}
      description={description}
      running={test.testing}
      unavailableReason={disabled ? null : unavailableReason}
      actions={
        <div className="flex gap-2">
          <Combobox
            items={recipients.map((recipient) => recipient.id)}
            filteredItems={matches.map((recipient) => recipient.id)}
            open={open}
            onOpenChange={setWantsOpen}
            itemToStringLabel={nameFor}
            value={test.picked}
            onValueChange={test.pick}
            inputValue={test.text}
            onInputValueChange={(next, details) => {
              if (!typedIds || TEXT_CHANGE_REASONS.has(details.reason)) {
                test.type(next, pickedLabel, details.reason !== 'item-press')
              }
            }}
            disabled={blocked}
          >
            <ComboboxInput
              aria-label="Send to"
              showTrigger={!hasEntry}
              placeholder={placeholder}
              autoComplete="off"
              disabled={blocked}
              onBlur={test.blur}
              aria-invalid={test.idError !== null}
              aria-describedby={test.idError ? errorId : undefined}
              className="min-w-0 flex-1 md:w-72"
            >
              {hasEntry && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear"
                    disabled={blocked}
                    onClick={test.clear}
                  >
                    <X aria-hidden />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </ComboboxInput>
            <ComboboxContent>
              {noRecipients && <ComboboxEmpty>{emptyText}</ComboboxEmpty>}
              <ComboboxList>
                {(id: Id) => (
                  <ComboboxItem key={id} value={id}>
                    {typedIds ? (
                      <OptionLabel description={String(id)}>
                        {nameFor(id)}
                      </OptionLabel>
                    ) : (
                      nameFor(id)
                    )}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <Button
            type="button"
            variant="neutral"
            disabled={blocked || !test.valid || test.testing}
            onClick={test.send}
          >
            <BusyLabel
              busy={test.testing}
              label="Send test"
              busyLabel="Sending..."
            />
          </Button>
        </div>
      }
      result={
        <>
          {test.idError && (
            <FieldError id={errorId} errors={[{ message: test.idError }]} />
          )}
          <ConnectionTest
            size="inline"
            testing={false}
            outcome={test.outcome}
          />
        </>
      }
      live={
        test.testing ? (
          <ConnectionTest size="inline" testing outcome={null} />
        ) : undefined
      }
    />
  )
}
