import { useStore } from '@tanstack/react-form'
import { Info } from 'lucide-react'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  ConditionChildren,
  GroupAddButtons,
  GroupMatch,
  type TreeActions,
} from '@/features/library/components/content-router/condition-group'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import {
  groupWithConditions,
  ROOT_ID,
  type RuleNode,
  removeNode,
} from '@/features/library/lib/content-router/condition-tree'

interface ConditionBuilderProps {
  form: RouteEditorForm
  catalog: ConditionCatalog
  disabled: boolean
}

export function ConditionBuilder({
  form,
  catalog,
  disabled,
}: ConditionBuilderProps) {
  const nodes = useStore(form.store, (state) => state.values.conditions)
  const root = nodes.find((node) => node.id === ROOT_ID)

  const replace = (next: RuleNode[]) => {
    form.setFieldValue('conditions', next)
    // Indexes shift on a structural edit, so errors are recomputed for every row once the form was submitted.
    if (form.state.submissionAttempts > 0) void form.validate('blur')
  }

  const actions: TreeActions = {
    addCondition: (groupId) =>
      replace([...form.state.values.conditions, catalog.blank(groupId)]),
    addGroup: (parentId) =>
      replace([
        ...form.state.values.conditions,
        ...groupWithConditions(parentId, catalog.blank),
      ]),
    remove: (id) =>
      replace(removeNode(form.state.values.conditions, id, catalog.blank)),
  }

  if (root?.kind !== 'group') return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex flex-auto items-center gap-2.5 text-base font-bold">
          <Badge>If</Badge>
          Conditions
        </span>
        <GroupMatch
          form={form}
          index={nodes.indexOf(root)}
          label="Match conditions"
          target="all conditions"
          disabled={disabled}
        />
      </div>
      {root.negate && (
        <Alert variant="info" role="note">
          <Info />
          <AlertTitle>
            Inverted. This route applies when the conditions below are{' '}
            <b>not</b> met.
          </AlertTitle>
        </Alert>
      )}
      <ConditionChildren
        form={form}
        nodes={nodes}
        group={root}
        catalog={catalog}
        disabled={disabled}
        actions={actions}
      />
      <GroupAddButtons
        nodes={nodes}
        groupId={ROOT_ID}
        disabled={disabled}
        actions={actions}
      />
    </div>
  )
}
