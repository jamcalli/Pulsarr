import { cn } from 'cn'
import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { ConditionValue } from '@/features/library/components/content-router/condition-value'
import { NotToggle } from '@/features/library/components/content-router/not-toggle'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import {
  isConditionOperator,
  MINIMUM_VOTES,
  OPERATOR_LABELS,
  VOTE_FIELDS,
} from '@/features/library/lib/content-router/condition-fields'
import type { ConditionNode } from '@/features/library/lib/content-router/condition-tree'
import { valueFits } from '@/features/library/lib/content-router/value-control'

interface ConditionRowProps {
  form: RouteEditorForm
  index: number
  node: ConditionNode
  catalog: ConditionCatalog
  disabled: boolean
  onRemove: () => void
}

export function ConditionRow({
  form,
  index,
  node,
  catalog,
  disabled,
  onRemove,
}: ConditionRowProps) {
  const [votesOpen, setVotesOpen] = useState(node.votes !== undefined)
  const path = `conditions[${index}]` as const
  const field = catalog.fields.find(
    (candidate) => candidate.name === node.field,
  )
  const control = catalog.controlFor(node.field, node.operator) ?? {
    kind: 'text',
    regex: false,
  }
  const fieldOptions = catalog.fields.map((candidate) => ({
    value: candidate.name,
    label: candidate.label,
  }))
  const operatorOptions = (field?.operators ?? []).flatMap(({ name }) =>
    isConditionOperator(name)
      ? [{ value: name, label: OPERATOR_LABELS[name] }]
      : [],
  )
  const canCountVotes = VOTE_FIELDS.has(node.field)
  const showVotes = canCountVotes && (votesOpen || node.votes !== undefined)

  const resetValue = (
    fieldName: string,
    operator: ConditionNode['operator'],
  ) => {
    const next = catalog.controlFor(fieldName, operator)
    const current = form.getFieldValue(`${path}.value`)
    if (next === null || !valueFits(current, next)) {
      form.setFieldValue(
        `${path}.value`,
        catalog.emptyValue(fieldName, operator),
      )
    }
    if (!VOTE_FIELDS.has(fieldName)) {
      form.setFieldValue(`${path}.votes`, undefined)
      setVotesOpen(false)
    }
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-divider p-2.5',
        node.negate && 'border-foreground',
      )}
    >
      <div className="grid grid-cols-2 items-start gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_auto]">
        <form.AppField
          name={`${path}.field`}
          listeners={{
            onChange: ({ value }) => {
              const next = catalog.fields.find(
                (candidate) => candidate.name === value,
              )
              const operator = next?.operators[0]?.name
              if (operator === undefined || !isConditionOperator(operator)) {
                return
              }
              form.setFieldValue(`${path}.operator`, operator)
              resetValue(value, operator)
            },
          }}
        >
          {(input) => (
            <input.SelectField
              label="Field"
              labelHidden
              placeholder="Choose a field"
              disabled={disabled}
              options={fieldOptions}
            />
          )}
        </form.AppField>
        <form.AppField
          name={`${path}.operator`}
          listeners={{
            onChange: ({ value }) => {
              if (isConditionOperator(value)) resetValue(node.field, value)
            },
          }}
        >
          {(input) => (
            <input.SelectField
              label="Operator"
              labelHidden
              disabled={disabled}
              options={operatorOptions}
            />
          )}
        </form.AppField>
        <div className="col-span-2 md:col-span-1">
          <ConditionValue
            form={form}
            index={index}
            field={node.field}
            control={control}
            catalog={catalog}
            disabled={disabled}
          />
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
          <form.Field name={`${path}.negate`}>
            {(negate) => (
              <NotToggle
                pressed={negate.state.value}
                onPressedChange={negate.handleChange}
                target="this condition"
                disabled={disabled}
              />
            )}
          </form.Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove condition"
            disabled={disabled}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      </div>
      {showVotes && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">and at least</span>
          <div className="w-44">
            <form.AppField name={`${path}.votes`}>
              {(input) => (
                <input.NumberField
                  label="Minimum votes"
                  labelHidden
                  unit="vote"
                  min={MINIMUM_VOTES.min}
                  max={MINIMUM_VOTES.max}
                  disabled={disabled}
                />
              )}
            </form.AppField>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              form.setFieldValue(`${path}.votes`, undefined)
              setVotesOpen(false)
            }}
          >
            Remove vote count
          </Button>
        </div>
      )}
      {canCountVotes && !showVotes && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() => setVotesOpen(true)}
        >
          Add a minimum vote count
        </Button>
      )}
      <form.Field name={path}>
        {(row) => <FieldError errors={row.state.meta.errors} />}
      </form.Field>
    </div>
  )
}
