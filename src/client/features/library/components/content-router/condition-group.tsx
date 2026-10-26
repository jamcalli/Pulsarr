import { cn } from 'cn'
import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConditionRow } from '@/features/library/components/content-router/condition-row'
import { NotToggle } from '@/features/library/components/content-router/not-toggle'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import {
  childrenOf,
  type GroupNode,
  groupDepth,
  isGroupAtMaxDepth,
  isGroupFull,
  type RuleNode,
} from '@/features/library/lib/content-router/condition-tree'

const MATCH_OPTIONS: Array<{ value: GroupNode['operator']; label: string }> = [
  { value: 'AND', label: 'All' },
  { value: 'OR', label: 'Any' },
]

export interface TreeActions {
  addCondition: (groupId: string) => void
  addGroup: (parentId: string) => void
  remove: (id: string) => void
}

interface GroupProps {
  form: RouteEditorForm
  nodes: RuleNode[]
  group: GroupNode
  catalog: ConditionCatalog
  disabled: boolean
  actions: TreeActions
}

export function ConditionChildren({
  form,
  nodes,
  group,
  catalog,
  disabled,
  actions,
}: GroupProps) {
  const join = group.operator === 'AND' ? 'and' : 'or'
  return childrenOf(nodes, group.id).map((child, position) => (
    <Fragment key={child.id}>
      {position > 0 && (
        <div className="flex items-center gap-2">
          <Separator className="data-horizontal:w-3.5" />
          <Badge variant="secondary">{join}</Badge>
          <Separator className="flex-1" />
        </div>
      )}
      {child.kind === 'group' ? (
        <ConditionGroup
          form={form}
          nodes={nodes}
          group={child}
          catalog={catalog}
          disabled={disabled}
          actions={actions}
        />
      ) : (
        <ConditionRow
          form={form}
          index={nodes.indexOf(child)}
          node={child}
          catalog={catalog}
          disabled={disabled}
          onRemove={() => actions.remove(child.id)}
        />
      )}
    </Fragment>
  ))
}

export function GroupMatch({
  form,
  index,
  label,
  target,
  disabled,
}: {
  form: RouteEditorForm
  index: number
  label: string
  target: string
  disabled: boolean
}) {
  return (
    <>
      <span className="text-sm text-muted-foreground" aria-hidden>
        Match
      </span>
      <div className="w-fit">
        <form.AppField name={`conditions[${index}].operator`}>
          {(input) => (
            <input.SegmentedField
              label={label}
              labelHidden
              disabled={disabled}
              options={MATCH_OPTIONS}
            />
          )}
        </form.AppField>
      </div>
      <form.Field name={`conditions[${index}].negate`}>
        {(negate) => (
          <NotToggle
            pressed={negate.state.value}
            onPressedChange={negate.handleChange}
            target={target}
            disabled={disabled}
          />
        )}
      </form.Field>
    </>
  )
}

/** Add condition and Add group for one group, each disabled at the server's size or depth cap. */
export function GroupAddButtons({
  nodes,
  groupId,
  disabled,
  actions,
}: {
  nodes: RuleNode[]
  groupId: string
  disabled: boolean
  actions: TreeActions
}) {
  const full = isGroupFull(nodes, groupId)
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || full}
        onClick={() => actions.addCondition(groupId)}
      >
        Add condition
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || full || isGroupAtMaxDepth(nodes, groupId)}
        onClick={() => actions.addGroup(groupId)}
      >
        Add group
      </Button>
    </div>
  )
}

const BOXED_DEPTH = 2

function ConditionGroup(props: GroupProps) {
  const { form, nodes, group, disabled, actions } = props
  const depth = groupDepth(nodes, group.id)
  const boxed = depth <= BOXED_DEPTH
  return (
    <fieldset
      aria-label={`Condition group, level ${depth}`}
      className={cn(
        'flex min-w-0 flex-col gap-3 border-dashed border-divider',
        boxed ? 'rounded-md border bg-inset p-3 md:p-4' : 'border-l pl-2',
        group.negate && 'border-solid border-foreground',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Group</span>
        <GroupMatch
          form={form}
          index={nodes.indexOf(group)}
          label="Match group conditions"
          target="this group"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={disabled}
          onClick={() => actions.remove(group.id)}
        >
          Remove group
        </Button>
      </div>
      <ConditionChildren {...props} />
      <GroupAddButtons
        nodes={nodes}
        groupId={group.id}
        disabled={disabled}
        actions={actions}
      />
    </fieldset>
  )
}
