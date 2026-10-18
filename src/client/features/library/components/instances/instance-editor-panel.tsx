import { useStore } from '@tanstack/react-form'
import { type RefObject, useLayoutEffect, useRef } from 'react'
import { InstanceEditor } from '@/features/library/components/instances/instance-editor'
import { SyncExistingRow } from '@/features/library/components/instances/sync-existing-row'
import { useInstanceEditor } from '@/features/library/hooks/instances/useInstanceEditor'
import type { SaveOutcome } from '@/features/library/hooks/instances/useInstanceForm'
import type {
  ArrType,
  EditTarget,
} from '@/features/library/lib/instances/instance-form'
import type { ArrTarget } from '@/lib/approval'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

interface EditorActions {
  /** Resolves true only when the editor saved in this call. */
  submit: () => Promise<boolean>
  discard: () => void
  runTest: () => void
}

export interface EditorSession {
  dirty: boolean
  saving: boolean
  saved: boolean
  errorMessage: string | null
  saveLabel: string
  saveDisabled: boolean
  draftName: string
  actions: RefObject<EditorActions | null>
}

interface InstanceEditorPanelProps {
  type: ArrType
  edit: EditTarget
  open: boolean
  instances: readonly ArrTarget[]
  config: Config
  webhookDirty: boolean
  onSaved: (outcome: SaveOutcome) => void
  onRemove: (target: ArrTarget) => void
  onFixAddress: () => void
  /** Receives the session while the card is open, and null once it closes. */
  onSession: (session: EditorSession | null) => void
}

/** Mounted by the accordion panel, so each opening starts a fresh form and checks. */
export function InstanceEditorPanel({
  type,
  edit,
  open,
  instances,
  config,
  webhookDirty,
  onSaved,
  onRemove,
  onFixAddress,
  onSession,
}: InstanceEditorPanelProps) {
  const editor = useInstanceEditor({ type, edit, instances, config, onSaved })
  const draftName = useStore(
    editor.form.store,
    (state) => state.values.instance.name,
  )
  const actions = useRef<EditorActions | null>(null)

  useLayoutEffect(() => {
    actions.current = {
      submit: async () => !editor.saveDisabled && editor.submit(),
      discard: editor.discard,
      runTest: editor.test.run,
    }
  })

  const { dirty, saving, saved, errorMessage, saveLabel, saveDisabled } = editor
  useLayoutEffect(() => {
    if (!open) return
    onSession({
      dirty,
      saving,
      saved,
      errorMessage,
      saveLabel,
      saveDisabled,
      draftName,
      actions,
    })
    return () => onSession(null)
  }, [
    open,
    dirty,
    saving,
    saved,
    errorMessage,
    saveLabel,
    saveDisabled,
    draftName,
    onSession,
  ])

  const target = edit.kind === 'saved' ? edit.target : null
  const syncSource = target?.instance.isDefault ? target.instance : null
  const syncRows = syncSource
    ? instances
        .filter(({ instance }) =>
          syncSource.syncedInstances?.includes(instance.id),
        )
        .map(({ instance }) => (
          <SyncExistingRow
            key={instance.id}
            type={type}
            sourceName={syncSource.name}
            target={{ id: instance.id, name: instance.name }}
            dirty={dirty || webhookDirty}
          />
        ))
    : null

  return (
    <InstanceEditor
      editor={editor}
      syncRows={syncRows}
      remove={
        target && {
          disabledReason:
            target.instance.isDefault && instances.length > 1
              ? 'Make another instance the default to remove this one.'
              : null,
          onRemove: () => onRemove(target),
        }
      }
      onFixAddress={onFixAddress}
    />
  )
}
