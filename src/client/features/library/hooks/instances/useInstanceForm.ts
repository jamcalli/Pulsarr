import { useRef, useState } from 'react'
import { invalidateInstanceHealth } from '@/features/library/hooks/instances/useInstanceHealth'
import {
  createInstance,
  refreshInstances,
  updateInstance,
} from '@/features/library/hooks/instances/useInstances'
import {
  type ArrType,
  type EditTarget,
  editValues,
  type InstanceFormValues,
} from '@/features/library/lib/instances/instance-form'
import { InstanceEditorSchema } from '@/features/library/lib/instances/instance-form.schema'
import { useSaveForm } from '@/hooks/useSaveForm'
import type { components } from '@/types/api.js'

export interface SaveOutcome {
  /** Null after an add, since the editor closes and the new card joins the list. */
  savedId: number | null
}

interface InstanceFormOptions {
  type: ArrType
  edit: EditTarget | null
  onSaved: (outcome: SaveOutcome) => void
}

type ArrInstanceConflict = components['schemas']['ArrInstanceConflict']

function persist(
  type: ArrType,
  edit: EditTarget,
  values: InstanceFormValues,
): Promise<ArrInstanceConflict | null> {
  if (edit.kind === 'saved') {
    return updateInstance(type, edit.target.instance.id, values)
  }
  return edit.placeholderId === null
    ? createInstance(type, values)
    : updateInstance(type, edit.placeholderId, values)
}

/** The values sit under `instance`, which is where `InstanceFields` mounts. */
export function useInstanceForm({ type, edit, onSaved }: InstanceFormOptions) {
  const fresh = useRef<EditTarget | null>(null)
  const [callbackConflict, setCallbackConflict] =
    useState<ArrInstanceConflict | null>(null)

  const saveForm = useSaveForm({
    source: edit,
    toValues: (source: EditTarget | null) => ({
      instance: editValues(source),
    }),
    save: async ({ instance: values }: { instance: InstanceFormValues }) => {
      if (edit === null) return
      setCallbackConflict(null)
      const conflict = await persist(type, edit, values)
      if (conflict) {
        setCallbackConflict(conflict)
        throw conflict
      }
      const savedId = edit.kind === 'saved' ? edit.target.instance.id : null
      const targets = await refreshInstances(type)
      const target =
        savedId === null
          ? undefined
          : targets.find(({ instance }) => instance.id === savedId)
      fresh.current = target ? { kind: 'saved', target } : null
      if (savedId !== null) void invalidateInstanceHealth(type, savedId)
      onSaved({ savedId })
    },
    latest: () => fresh.current,
    schema: InstanceEditorSchema,
    saveErrorFallback: 'The instance was not saved. Save again to retry.',
  })

  return {
    ...saveForm,
    callbackConflict,
    clearCallbackConflict: () => setCallbackConflict(null),
    discard: () => {
      setCallbackConflict(null)
      saveForm.discard()
    },
  }
}
