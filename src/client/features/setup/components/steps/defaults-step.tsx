import { ErrorAlert } from '@/components/error-alert'
import { NewUserDefaultsFields } from '@/components/new-user-defaults-fields'
import {
  SaveAndContinueButton,
  type SetupStepProps,
  StepLayout,
} from '@/features/setup/components/step-layout'
import { useNewUserDefaultsForm } from '@/hooks/useNewUserDefaultsForm'

export function DefaultsStep({ steps, config, onDirtyChange }: SetupStepProps) {
  const defaults = useNewUserDefaultsForm(config, { onSaved: steps.next })

  return (
    <defaults.form.AppForm>
      <defaults.form.Form className="contents">
        <StepLayout
          step="defaults"
          onDirtyChange={onDirtyChange}
          dirty={defaults.dirty}
          onBack={steps.back}
          onSkip={defaults.dirty ? steps.skip : null}
          actions={
            <SaveAndContinueButton
              dirty={defaults.dirty}
              saving={defaults.saving}
              onContinue={steps.next}
            />
          }
        >
          <NewUserDefaultsFields form={defaults.form} />
          <ErrorAlert message={defaults.errorMessage} />
        </StepLayout>
      </defaults.form.Form>
    </defaults.form.AppForm>
  )
}
