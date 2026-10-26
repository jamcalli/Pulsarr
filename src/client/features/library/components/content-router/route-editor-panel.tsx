import { useStore } from '@tanstack/react-form'
import { useLayoutEffect } from 'react'
import { RouteEditor } from '@/features/library/components/content-router/route-editor'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import { useRouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import type { RouteFormValues } from '@/features/library/lib/content-router/route-form'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

interface RouteEditorPanelProps {
  type: RouteType
  /** Null while creating a route. */
  rule: RouterRule | null
  catalog: ConditionCatalog
  targets: RouteTargets
  newEnabled: boolean
  /** Receives the live values for the card header, and null on unmount. */
  onValues: (values: RouteFormValues | null) => void
  onClose: () => void
  onDelete: (rule: RouterRule) => void
  reportDirty: (dirty: boolean) => void
}

export function RouteEditorPanel({
  type,
  rule,
  catalog,
  targets,
  newEnabled,
  onValues,
  onClose,
  onDelete,
  reportDirty,
}: RouteEditorPanelProps) {
  const editor = useRouteEditorForm({
    type,
    rule,
    catalog,
    targets,
    newEnabled,
    onSaved: onClose,
    reportDirty,
  })
  const values = useStore(editor.form.store, (state) => state.values)

  useLayoutEffect(() => {
    onValues(values)
  }, [values, onValues])
  useLayoutEffect(() => () => onValues(null), [onValues])

  return (
    <RouteEditor
      type={type}
      editor={editor}
      catalog={catalog}
      onCancel={onClose}
      onDelete={rule === null ? undefined : () => onDelete(rule)}
    />
  )
}
