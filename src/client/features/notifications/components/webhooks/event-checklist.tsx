import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types'
import { useStore } from '@tanstack/react-form'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { useWebhookEventDescriptions } from '@/features/notifications/hooks/webhooks/useWebhookEventDescriptions'
import { NO_EVENTS_MESSAGE } from '@/features/notifications/lib/endpoint-form.schema'
import { WEBHOOK_EVENT_LABELS } from '@/features/notifications/lib/webhooks'
import { useFieldContext } from '@/lib/form-context'
import type { components } from '@/types/api.js'

type WebhookEventType = components['schemas']['WebhookEventType']

export function EventChecklist({ disabled }: { disabled?: boolean }) {
  const field = useFieldContext<WebhookEventType[]>()
  const descriptions = useWebhookEventDescriptions()
  const submitted = useStore(
    field.form.store,
    (state) => state.submissionAttempts > 0,
  )
  const selected = field.state.value
  const showEmpty =
    selected.length === 0 && (field.state.meta.isTouched || submitted)
  const errorId = `${field.name}-error`

  const toggle = (type: WebhookEventType, checked: boolean) =>
    field.handleChange(
      WEBHOOK_EVENT_TYPES.filter((event) =>
        event === type ? checked : selected.includes(event),
      ),
    )

  return (
    <FieldSet
      data-invalid={showEmpty}
      aria-describedby={showEmpty ? errorId : undefined}
      className="gap-3"
    >
      <FieldLegend
        variant="label"
        className={showEmpty ? 'mb-0 text-destructive-text' : 'mb-0'}
      >
        Events
      </FieldLegend>
      {showEmpty && <FieldError id={errorId}>{NO_EVENTS_MESSAGE}</FieldError>}
      <FieldGroup data-slot="checkbox-group">
        {WEBHOOK_EVENT_TYPES.map((type) => {
          const id = `${field.name}-${type}`
          return (
            <Field key={type} orientation="horizontal" data-disabled={disabled}>
              <Checkbox
                id={id}
                checked={selected.includes(type)}
                disabled={disabled}
                onCheckedChange={(checked) => toggle(type, checked)}
                onBlur={field.handleBlur}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>
                  {WEBHOOK_EVENT_LABELS[type]}
                </FieldLabel>
                {descriptions.has(type) && (
                  <FieldDescription>{descriptions.get(type)}</FieldDescription>
                )}
              </FieldContent>
            </Field>
          )
        })}
      </FieldGroup>
    </FieldSet>
  )
}
