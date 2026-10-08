import { NumberField as NumberFieldPrimitive } from '@base-ui/react/number-field'
import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { FieldError } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { useFieldContext } from '@/lib/form-context'
import { formatLocale, formatNumber, pluralize } from '@/lib/format'

type UnitProps =
  | {
      /** Singular noun for the value, pluralized from it unless `unitPlural` is given. */
      unit: string
      unitPlural?: string
      unitSymbol?: never
    }
  | {
      /** Rendered as-is after the value and never pluralized, for symbols such as `%` or `/10`. */
      unitSymbol: string
      unit?: never
      unitPlural?: never
    }
  | { unit?: never; unitPlural?: never; unitSymbol?: never }

type NumberFieldProps = UnitProps & {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  labelHidden?: boolean
  min: number
  max: number
  step?: number
  grouping?: boolean
  /** Typed values outside min and max are left for validation instead of clamped on blur. */
  allowOutOfRange?: boolean
}

export function NumberField({
  label,
  description,
  disabled,
  orientation = 'responsive',
  labelHidden = false,
  unit,
  unitPlural,
  unitSymbol,
  min,
  max,
  step = 1,
  grouping = true,
  allowOutOfRange = false,
}: NumberFieldProps) {
  const field = useFieldContext<number | undefined>()
  const isInvalid = field.state.meta.errors.length > 0
  const errorId = `${field.name}-error`
  const addon =
    unit === undefined
      ? unitSymbol
      : pluralize(field.state.value ?? 0, unit, unitPlural)
  const range = `${formatNumber(min)} to ${formatNumber(max)}`
  const hint =
    unit === undefined ? range : `${range} ${pluralize(max, unit, unitPlural)}`

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation={orientation}
      labelHidden={labelHidden}
      htmlFor={field.name}
      invalid={isInvalid}
    >
      <div
        className={cn(
          'flex flex-col gap-2',
          !labelHidden &&
            orientation === 'responsive' &&
            '@md/field-group:basis-72',
        )}
      >
        <NumberFieldPrimitive.Root
          id={field.name}
          name={field.name}
          value={field.state.value ?? null}
          onValueChange={(next) => field.handleChange(next ?? undefined)}
          locale={formatLocale()}
          format={grouping ? undefined : { useGrouping: false }}
          min={min}
          max={max}
          allowOutOfRange={allowOutOfRange}
          step={step}
          largeStep={10}
          disabled={disabled}
        >
          <NumberFieldPrimitive.Group render={<InputGroup />}>
            <NumberFieldPrimitive.Input
              render={<InputGroupInput disabled={disabled} />}
              onBlur={field.handleBlur}
              aria-invalid={isInvalid}
              aria-describedby={isInvalid ? errorId : undefined}
            />
            {addon !== undefined && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>{addon}</InputGroupText>
              </InputGroupAddon>
            )}
          </NumberFieldPrimitive.Group>
        </NumberFieldPrimitive.Root>
        {isInvalid ? (
          <FieldError id={errorId} errors={field.state.meta.errors} />
        ) : (
          !labelHidden && (
            <p className="text-sm text-muted-foreground">{hint}</p>
          )
        )}
      </div>
    </FieldRow>
  )
}
