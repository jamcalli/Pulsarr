import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import {
  numberRange,
  unitSymbol,
} from '@/features/library/lib/content-router/condition-fields'
import {
  chipInputSchema,
  type ValueControl,
} from '@/features/library/lib/content-router/value-control'

interface ConditionValueProps {
  form: RouteEditorForm
  index: number
  field: string
  control: ValueControl
  catalog: ConditionCatalog
  disabled: boolean
}

function NumberInput({
  form,
  name,
  label,
  field,
  disabled,
}: {
  form: RouteEditorForm
  name:
    | `conditions[${number}].value`
    | `conditions[${number}].value.${'min' | 'max'}`
  label: string
  field: string
  disabled: boolean
}) {
  const { min, max, step, grouping } = numberRange(field)
  const symbol = unitSymbol(field)
  return (
    <form.AppField name={name}>
      {(input) =>
        symbol === undefined ? (
          <input.NumberField
            label={label}
            labelHidden
            min={min}
            max={max}
            step={step}
            grouping={grouping}
            disabled={disabled}
          />
        ) : (
          <input.NumberField
            label={label}
            labelHidden
            unitSymbol={symbol}
            min={min}
            max={max}
            step={step}
            grouping={grouping}
            disabled={disabled}
          />
        )
      }
    </form.AppField>
  )
}

export function ConditionValue({
  form,
  index,
  field,
  control,
  catalog,
  disabled,
}: ConditionValueProps) {
  const name = `conditions[${index}].value` as const

  switch (control.kind) {
    case 'number':
      return (
        <NumberInput
          form={form}
          name={name}
          label="Value"
          field={field}
          disabled={disabled}
        />
      )
    case 'range':
      return (
        <div className="flex items-center gap-2">
          <NumberInput
            form={form}
            name={`conditions[${index}].value.min`}
            label="From"
            field={field}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <NumberInput
            form={form}
            name={`conditions[${index}].value.max`}
            label="To"
            field={field}
            disabled={disabled}
          />
        </div>
      )
    case 'select':
      return (
        <form.AppField name={name}>
          {(input) => (
            <input.SelectField
              label="Value"
              labelHidden
              placeholder="Choose a value"
              disabled={disabled}
              options={catalog.options[control.source]}
            />
          )}
        </form.AppField>
      )
    case 'chips': {
      const { source, numeric } = control
      return (
        <form.AppField name={name}>
          {(input) =>
            source === null ? (
              <input.TagsField
                label="Values"
                labelHidden
                placeholder="Type a value and press Enter"
                disabled={disabled}
                options={[]}
                createSchema={chipInputSchema(numeric)}
                createLabel={(text) => `Add ${text}`}
                onCreate={(text) => ({ value: text, label: text })}
              />
            ) : (
              <input.TagsField
                label="Values"
                labelHidden
                placeholder="Choose values"
                emptyText="Nothing left to add"
                disabled={disabled}
                options={catalog.options[source]}
              />
            )
          }
        </form.AppField>
      )
    }
    case 'text':
      return (
        <form.AppField name={name}>
          {(input) => (
            <input.TextField
              label="Value"
              labelHidden
              placeholder={control.regex ? 'Regular expression' : 'Value'}
              disabled={disabled}
            />
          )}
        </form.AppField>
      )
  }
}
