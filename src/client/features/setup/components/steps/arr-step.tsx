import { useState } from 'react'
import { InstanceEditor } from '@/components/arr/instance-editor'
import { WebhookFixCredenza } from '@/components/arr/webhook-fix-credenza'
import { ErrorAlert } from '@/components/error-alert'
import { InlineLink } from '@/components/inline-link'
import { RetryAlert } from '@/components/retry-alert'
import { SeparatedList, SeparatedListRow } from '@/components/separated-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { StepFieldsSkeleton } from '@/features/setup/components/setup-dialog-skeleton'
import {
  SaveAndContinueButton,
  type SetupStepProps,
  StepLayout,
} from '@/features/setup/components/step-layout'
import { useInstanceEditor } from '@/hooks/arr/useInstanceEditor'
import type { ArrTarget } from '@/lib/approval'
import { INSTANCE_COPY } from '@/lib/arr/instance-copy'
import type { ArrType } from '@/lib/arr/instance-form'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { useSetupStore } from '@/stores/setupStore'

type ArrStepProps = SetupStepProps & { type: ArrType }

function SavedInstances({
  type,
  instances,
}: {
  type: ArrType
  instances: readonly ArrTarget[]
}) {
  const dismiss = useSetupStore((state) => state.dismiss)
  const page = NAV_PAGES[type]
  return (
    <>
      <SeparatedList label="Instances">
        {instances.map(({ instance }) => (
          <SeparatedListRow key={instance.id}>
            <ItemContent>
              <ItemTitle>{instance.name}</ItemTitle>
              <ItemDescription className="wrap-anywhere">
                {instance.baseUrl}
              </ItemDescription>
            </ItemContent>
            {instance.isDefault && (
              <ItemActions>
                <Badge variant="secondary">Default</Badge>
              </ItemActions>
            )}
          </SeparatedListRow>
        ))}
      </SeparatedList>
      <p className="text-sm text-muted-foreground">
        Add more instances on the{' '}
        <InlineLink to={pageHref(page)} onClick={dismiss}>
          {page.label} page
        </InlineLink>
        .
      </p>
    </>
  )
}

function NewInstance({ type, steps, config, onDirtyChange }: ArrStepProps) {
  const list = steps.instances[type]
  const editor = useInstanceEditor({
    type,
    edit: {
      kind: 'new',
      first: true,
      placeholderId: list.placeholder?.instance.id ?? null,
    },
    instances: list.instances,
    config,
    onSaved: () => steps.next(),
  })
  const [fixOpen, setFixOpen] = useState(false)

  return (
    <>
      <editor.form.AppForm>
        <editor.form.Form className="contents">
          <StepLayout
            step={type}
            onDirtyChange={onDirtyChange}
            dirty={editor.dirty}
            onBack={steps.back}
            onSkip={steps.skip}
            actions={
              <SaveAndContinueButton
                dirty={editor.dirty}
                saving={editor.saving}
                disabled={editor.saveDisabled}
              />
            }
          >
            <InstanceEditor
              editor={editor}
              syncRows={null}
              remove={null}
              onFixAddress={() => setFixOpen(true)}
            />
            <ErrorAlert message={editor.errorMessage} />
          </StepLayout>
        </editor.form.Form>
      </editor.form.AppForm>
      <WebhookFixCredenza
        type={type}
        config={config}
        open={fixOpen}
        onOpenChange={setFixOpen}
        onFixed={() => {
          setFixOpen(false)
          editor.test.run()
        }}
      />
    </>
  )
}

export function ArrStep(props: ArrStepProps) {
  const { type, steps, onDirtyChange } = props
  const list = steps.instances[type]
  const layout = {
    step: type,
    onDirtyChange,
    onBack: steps.back,
  }

  if (!list.hasData) {
    return (
      <StepLayout {...layout} onSkip={steps.skip} actions={null}>
        {list.errorMessage ? (
          <RetryAlert
            message={INSTANCE_COPY[type].loadError}
            onRetry={list.retry}
          />
        ) : (
          <StepFieldsSkeleton />
        )}
      </StepLayout>
    )
  }

  if (list.instances.length === 0) return <NewInstance {...props} />

  return (
    <StepLayout
      {...layout}
      onSkip={null}
      actions={
        <Button type="button" onClick={steps.next}>
          Continue
        </Button>
      }
    >
      <SavedInstances type={type} instances={list.instances} />
    </StepLayout>
  )
}
