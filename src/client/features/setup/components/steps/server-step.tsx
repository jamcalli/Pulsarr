import { useStore } from '@tanstack/react-form'
import { ErrorAlert } from '@/components/error-alert'
import { ServerCard } from '@/components/plex/server-card'
import {
  SaveAndContinueButton,
  type SetupStepProps,
  StepLayout,
} from '@/features/setup/components/step-layout'
import { useServerSettings } from '@/hooks/plex/useServerSettings'
import { linkedToken } from '@/lib/plex/account-facts'
import { addressError } from '@/lib/plex/server-form.schema'

export function ServerStep({ steps, config, onDirtyChange }: SetupStepProps) {
  const server = useServerSettings(config, { onSaved: steps.next })
  const saveError = useStore(server.form.store, (state) =>
    addressError(state.values.server),
  )

  return (
    <server.form.AppForm>
      <server.form.Form className="contents">
        <StepLayout
          step="server"
          onDirtyChange={onDirtyChange}
          dirty={server.dirty}
          onBack={steps.back}
          onSkip={server.dirty ? steps.skip : null}
          actions={
            <SaveAndContinueButton
              dirty={server.dirty}
              saving={server.saving}
              disabled={saveError !== null}
              onContinue={steps.next}
            />
          }
        >
          <ServerCard
            form={server.form}
            fields="server"
            linkedToken={linkedToken(config)}
            dirty={server.dirty}
            discovery={server.discovery}
            test={server.test}
          />
          <ErrorAlert message={server.errorMessage} />
        </StepLayout>
      </server.form.Form>
    </server.form.AppForm>
  )
}
