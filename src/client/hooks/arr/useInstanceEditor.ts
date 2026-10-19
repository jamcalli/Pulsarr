import { ArrBaseUrlSchema } from '@root/schemas/common/url.schema'
import { useStore } from '@tanstack/react-form'
import type { ConnectionTestStatus } from '@/components/connection-test'
import { useConnectionTest } from '@/hooks/arr/useConnectionTest'
import { type SaveOutcome, useInstanceForm } from '@/hooks/arr/useInstanceForm'
import {
  type RoutingSource,
  useRoutingOptions,
} from '@/hooks/arr/useRoutingOptions'
import { useCreateArrTag } from '@/hooks/useCreateArrTag'
import type { ArrTarget } from '@/lib/approval'
import { INSTANCE_COPY } from '@/lib/arr/instance-copy'
import type { ArrType, EditTarget } from '@/lib/arr/instance-form'
import { ARR_TYPE_LABELS, seasonMonitoringOptions } from '@/lib/arr-labels'
import { webhookAddress, webhookAddressValues } from '@/lib/webhook-address'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

interface InstanceEditorOptions {
  type: ArrType
  edit: EditTarget | null
  instances: readonly ArrTarget[]
  config: Config
  onSaved: (outcome: SaveOutcome) => void
}

export function useInstanceEditor({
  type,
  edit,
  instances,
  config,
  onSaved,
}: InstanceEditorOptions) {
  const saveForm = useInstanceForm({ type, edit, onSaved })
  const values = useStore(saveForm.form.store, (state) => state.values.instance)
  const copy = INSTANCE_COPY[type]
  const saved = edit?.kind === 'saved' ? edit.target.instance : null
  const isNew = edit?.kind === 'new'

  const credentials = {
    baseUrl: values.baseUrl,
    apiKey: values.apiKey,
  }
  const test = useConnectionTest(type, credentials)
  const connectionChanged =
    isNew ||
    (saved !== null &&
      (values.baseUrl !== saved.baseUrl || values.apiKey !== saved.apiKey))
  const filled = credentials.baseUrl !== '' && credentials.apiKey !== ''
  const canTest =
    filled && ArrBaseUrlSchema.safeParse(credentials.baseUrl).success
  const testRequired =
    edit !== null &&
    connectionChanged &&
    (isNew || filled) &&
    test.status !== 'passed'

  const source: RoutingSource = saved
    ? { kind: 'saved', id: saved.id }
    : { kind: 'probe', credentials: test.passedCredentials }
  const routing = useRoutingOptions(type, source)
  const createTag = useCreateArrTag(type, saved?.id ?? null)

  const address = webhookAddressValues(config)
  const { callbackConflict } = saveForm
  const rawFailure = callbackConflict ?? test.failure
  const callbackFailed = rawFailure?.code === 'webhook_callback_failed'
  const status: ConnectionTestStatus = callbackConflict ? 'failed' : test.status
  const failure = rawFailure && {
    title: callbackFailed
      ? copy.callbackFailed(webhookAddress(address.baseUrl, address.port))
      : copy.connectFailed,
    message: rawFailure.message,
  }
  const requiredMessage = !(testRequired && canTest)
    ? null
    : isNew
      ? 'Test the connection before adding the instance.'
      : 'Test the connection before saving a new URL or API key.'

  const defaultLock =
    edit?.kind === 'new' && edit.first
      ? 'The first instance is always the default.'
      : saved?.isDefault
        ? 'To change the default, make another instance the default.'
        : null

  return {
    ...saveForm,
    type,
    isNew,
    test: {
      status,
      failure,
      requiredMessage,
      callbackFailed,
      canRun: canTest,
      run: () => {
        saveForm.clearCallbackConflict()
        test.run(credentials)
      },
    },
    routing,
    awaitingTest: isNew && test.passedCredentials === null,
    optionsFailedTitle: `Couldn't load options from ${saved?.name ?? ARR_TYPE_LABELS[type]}.`,
    seasonMonitoringOptions: seasonMonitoringOptions(
      values.routing.seasonMonitoring,
      config.plexSessionMonitoring?.enabled ?? false,
    ),
    createTag: saved ? createTag : undefined,
    defaultLock,
    syncOptions: instances
      .filter(({ instance }) => instance.id !== saved?.id)
      .map(({ instance }) => ({
        value: String(instance.id),
        label: instance.name,
      })),
    saveDisabled: testRequired,
    saveLabel: isNew ? 'Add instance' : 'Save changes',
  }
}

export type InstanceEditorState = ReturnType<typeof useInstanceEditor>
