import { HttpUrlSchema } from '@root/schemas/common/url.schema'
import { useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { FieldSection } from '@/components/field-section'
import { Button } from '@/components/ui/button'
import { EventChecklist } from '@/features/notifications/components/webhooks/event-checklist'
import { useSaveWebhookEndpoint } from '@/features/notifications/hooks/webhooks/useWebhookEndpointMutations'
import {
  createPayload,
  type EndpointFormValues,
  endpointFormValues,
  endpointSaveError,
  testPayload,
  updatePayload,
} from '@/features/notifications/lib/endpoint-form'
import { EndpointFormSchema } from '@/features/notifications/lib/endpoint-form.schema'
import { useFormDirty } from '@/hooks/useFormDirty'
import { useSendTest } from '@/hooks/useSendTest'
import { liveValidation, useAppForm } from '@/lib/form'
import { testWebhookUrl } from '@/lib/notification-tests'
import type { components } from '@/types/api.js'

type TestTarget = Pick<
  EndpointFormValues,
  'url' | 'authHeaderName' | 'authHeaderValue'
>

const REVEAL_LABEL = { show: 'Show header value', hide: 'Hide header value' }

function sameTarget(a: TestTarget, b: TestTarget): boolean {
  return (
    a.url === b.url &&
    a.authHeaderName === b.authHeaderName &&
    a.authHeaderValue === b.authHeaderValue
  )
}

function sendTest(target: TestTarget) {
  return testWebhookUrl(testPayload(target))
}

interface EndpointCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null adds a new endpoint. */
  endpoint: components['schemas']['WebhookEndpoint'] | null
}

export function EndpointCredenza({
  open,
  onOpenChange,
  endpoint,
}: EndpointCredenzaProps) {
  const save = useSaveWebhookEndpoint()
  const { reset: resetSave } = save
  const form = useAppForm({
    defaultValues: endpointFormValues(endpoint),
    validationLogic: liveValidation,
    validators: { onDynamic: EndpointFormSchema },
    onSubmit: ({ value }) =>
      save.save(
        endpoint
          ? { id: endpoint.id, body: updatePayload(endpoint, value) }
          : { id: null, body: createPayload(value) },
        { onSuccess: () => onOpenChange(false) },
      ),
  })
  const dirty = useFormDirty(form)
  const saveError = useStore(form.store, (state) =>
    endpointSaveError(state.values),
  )
  const url = useStore(form.store, (state) => state.values.url.trim())
  const authHeaderName = useStore(
    form.store,
    (state) => state.values.authHeaderName,
  )
  const authHeaderValue = useStore(
    form.store,
    (state) => state.values.authHeaderValue,
  )
  const target = { url, authHeaderName, authHeaderValue }
  const test = useSendTest(sendTest, target, sameTarget)
  const busy = save.pending
  const canTest =
    !busy && !test.testing && HttpUrlSchema.safeParse(target.url).success

  useEffect(() => {
    if (open) resetSave()
  }, [open, resetSave])

  return (
    <BulkFormCredenza
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={endpoint ? `Edit ${endpoint.name}` : 'Add endpoint'}
      description="Pulsarr posts to this URL for the events you pick."
      dirty={dirty}
      busy={busy}
      saveBar={{
        errorMessage: save.errorMessage,
        message: saveError ?? undefined,
        saveLabel: endpoint ? 'Save changes' : 'Add endpoint',
        saveDisabled: saveError !== null,
      }}
    >
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label="Name"
            orientation="vertical"
            placeholder="e.g. Home Assistant"
            autoComplete="off"
            disabled={busy}
          />
        )}
      </form.AppField>
      <div className="flex flex-col gap-2">
        <form.AppField name="url">
          {(field) => (
            <field.TextField
              label="URL"
              orientation="vertical"
              type="url"
              placeholder="https://..."
              autoComplete="off"
              disabled={busy}
              action={
                <Button
                  type="button"
                  variant="neutral"
                  disabled={!canTest}
                  onClick={() => test.run(target)}
                >
                  <BusyLabel
                    busy={test.testing}
                    label="Send test"
                    busyLabel="Sending..."
                  />
                </Button>
              }
            />
          )}
        </form.AppField>
        <ConnectionTest
          size="inline"
          testing={test.testing}
          outcome={test.outcome}
        />
      </div>
      <FieldSection
        title="Auth header"
        description="Optional. Sent with every request to this URL."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <form.AppField name="authHeaderName">
            {(field) => (
              <field.TextField
                label="Header name"
                orientation="vertical"
                placeholder="Authorization"
                autoComplete="off"
                disabled={busy}
              />
            )}
          </form.AppField>
          <form.AppField name="authHeaderValue">
            {(field) => (
              <field.SecretField
                label="Header value"
                orientation="vertical"
                placeholder="Bearer ..."
                revealLabel={REVEAL_LABEL}
                disabled={busy}
              />
            )}
          </form.AppField>
        </div>
      </FieldSection>
      <form.AppField name="enabled">
        {(field) => (
          <field.SwitchField
            label="Enabled"
            description="Turn off to pause deliveries without deleting."
            disabled={busy}
          />
        )}
      </form.AppField>
      <form.AppField name="eventTypes">
        {() => <EventChecklist disabled={busy} />}
      </form.AppField>
    </BulkFormCredenza>
  )
}
