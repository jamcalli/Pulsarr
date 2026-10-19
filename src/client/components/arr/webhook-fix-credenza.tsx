import { useEffect } from 'react'
import { BusyLabel } from '@/components/busy-label'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import {
  WebhookAddressForm,
  WebhookResults,
} from '@/components/settings/webhook-address-form'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useWebhookDialog } from '@/hooks/arr/useWebhookAddress'
import { useGuardedClose } from '@/hooks/useGuardedClose'
import type { ArrType } from '@/lib/arr/instance-form'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

interface WebhookFixCredenzaProps {
  type: ArrType
  config: Config
  open: boolean
  onOpenChange: (open: boolean) => void
  onFixed: () => void
}

function WebhookFixForm({
  type,
  config,
  onFixed,
  onDirtyChange,
}: Omit<WebhookFixCredenzaProps, 'open' | 'onOpenChange'> & {
  onDirtyChange: (dirty: boolean) => void
}) {
  const dialog = useWebhookDialog(config, (data) => {
    if (data[type].every((row) => row.success)) onFixed()
  })
  useEffect(() => {
    onDirtyChange(dialog.dirty)
  }, [dialog.dirty, onDirtyChange])

  return (
    <dialog.form.AppForm>
      <dialog.form.Form className="flex min-h-0 flex-1 flex-col">
        <CredenzaBody className="flex flex-col gap-4">
          <FieldGroup className="gap-6">
            <WebhookAddressForm
              form={dialog.form}
              fields="address"
              disabled={dialog.saving}
            />
          </FieldGroup>
          {dialog.result && (
            <WebhookResults
              ranAt={dialog.result.ranAt}
              results={dialog.result.data}
            />
          )}
          <ErrorAlert message={dialog.errorMessage} />
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose
            render={<Button variant="outline" disabled={dialog.saving} />}
          >
            Cancel
          </CredenzaClose>
          <Button type="submit" disabled={!dialog.dirty || dialog.saving}>
            <BusyLabel
              busy={dialog.saving}
              label="Save"
              busyLabel="Saving..."
            />
          </Button>
        </CredenzaFooter>
      </dialog.form.Form>
    </dialog.form.AppForm>
  )
}

export function WebhookFixCredenza({
  type,
  config,
  open,
  onOpenChange,
  onFixed,
}: WebhookFixCredenzaProps) {
  const guard = useGuardedClose(onOpenChange)

  return (
    <>
      <Credenza open={open} onOpenChange={guard.onOpenChange}>
        <CredenzaContent className="flex flex-col md:max-w-xl">
          <CredenzaHeader>
            <CredenzaTitle>Fix the webhook address</CredenzaTitle>
            <CredenzaDescription>
              {ARR_TYPE_LABELS[type]} has to reach Pulsarr to report finished
              downloads. Choose how your servers reach it, then save to update
              every webhook.
            </CredenzaDescription>
          </CredenzaHeader>
          <WebhookFixForm
            type={type}
            config={config}
            onFixed={onFixed}
            onDirtyChange={guard.setDirty}
          />
        </CredenzaContent>
      </Credenza>
      <LeaveDialog {...guard.leaveDialog} />
    </>
  )
}
