import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { SaveBar } from '@/components/settings/save-bar'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { InstanceCard } from '@/features/library/components/instances/instance-card'
import {
  type EditorSession,
  InstanceEditorPanel,
} from '@/features/library/components/instances/instance-editor-panel'
import { WebhookFixCredenza } from '@/features/library/components/instances/webhook-fix-credenza'
import { WebhooksSection } from '@/features/library/components/instances/webhooks-section'
import type { InstancesPage } from '@/features/library/hooks/instances/useInstancesPage'
import type { WebhookSection } from '@/features/library/hooks/instances/useWebhookAddress'
import { INSTANCE_COPY } from '@/features/library/lib/instances/instance-copy'
import type { EditTarget } from '@/features/library/lib/instances/instance-form'
import { instanceSummary } from '@/features/library/lib/instances/instance-summary'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

interface InstancesBodyProps {
  page: InstancesPage
  config: Config
  webhook: WebhookSection
}

export function InstancesBody({ page, config, webhook }: InstancesBodyProps) {
  const { type, list, edit } = page
  const copy = INSTANCE_COPY[type]
  const [session, setSession] = useState<EditorSession | null>(null)
  const [fixOpen, setFixOpen] = useState(false)
  const reportDirty = page.guard.setDirty
  const editorDirty = session?.dirty ?? false

  useEffect(() => {
    reportDirty(editorDirty)
  }, [editorDirty, reportDirty])

  const dirty = editorDirty || webhook.dirty
  const saving = (session?.saving ?? false) || webhook.saving
  const isNew = edit?.kind === 'new'
  const showEmpty = list.isPlaceholderOnly && !isNew
  const openValue = page.openKey === null ? [] : [page.openKey]

  const submit = () => {
    session?.actions.current?.submit()
    if (webhook.dirty && !webhook.form.state.isSubmitting) {
      webhook.form.handleSubmit()
    }
  }

  const editorPanel = (cardEdit: EditTarget, open: boolean) => (
    <InstanceEditorPanel
      type={type}
      edit={cardEdit}
      open={open}
      instances={list.instances}
      config={config}
      webhookDirty={webhook.dirty}
      onSaved={page.onSaved}
      onRemove={page.requestRemove}
      onFixAddress={() => setFixOpen(true)}
      onSession={setSession}
    />
  )

  return (
    <>
      <webhook.form.AppForm>
        <webhook.form.Form className="flex flex-col gap-5" submit={submit}>
          {showEmpty ? (
            <EmptyState
              icon={<Server />}
              title={copy.emptyTitle}
              description={copy.emptyDescription}
            >
              <Button type="button" onClick={() => page.open('new')}>
                Add instance
              </Button>
            </EmptyState>
          ) : (
            <Accordion value={openValue} className="gap-4">
              {list.instances.map((target) => {
                const { id } = target.instance
                const open = page.openKey === id
                return (
                  <InstanceCard
                    key={id}
                    value={id}
                    summary={instanceSummary(target, {
                      instances: list.instances,
                      health: page.health(id),
                      profileName:
                        target.instance.qualityProfile == null
                          ? null
                          : page.profileName(
                              id,
                              target.instance.qualityProfile,
                            ),
                    })}
                    open={open}
                    onToggle={() => (open ? page.collapse() : page.open(id))}
                  >
                    {editorPanel({ kind: 'saved', target }, open)}
                  </InstanceCard>
                )
              })}
              {edit?.kind === 'new' && (
                <InstanceCard
                  value="new"
                  summary={{
                    name: session?.draftName || 'New instance',
                    isDefault: false,
                    url: null,
                    facts: [],
                    status: null,
                  }}
                  open
                  onToggle={page.collapse}
                >
                  {editorPanel(edit, true)}
                </InstanceCard>
              )}
            </Accordion>
          )}
          {!list.isPlaceholderOnly && (
            <WebhooksSection webhook={webhook} saving={saving} />
          )}
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={((session?.saved ?? false) || webhook.saved) && !dirty}
            errorMessage={session?.errorMessage ?? webhook.errorMessage}
            saveLabel={session?.dirty ? session.saveLabel : 'Save changes'}
            saveDisabled={session?.dirty === true && session.saveDisabled}
            onDiscard={() => {
              webhook.discard()
              if (isNew) page.close()
              else session?.actions.current?.discard()
            }}
          />
        </webhook.form.Form>
      </webhook.form.AppForm>
      <WebhookFixCredenza
        type={type}
        config={config}
        open={fixOpen}
        onOpenChange={setFixOpen}
        onFixed={() => {
          setFixOpen(false)
          session?.actions.current?.runTest()
        }}
      />
    </>
  )
}
