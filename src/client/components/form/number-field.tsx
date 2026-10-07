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

interface NumberFieldProps {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  /** Singular noun for the value, pluralized from it unless `unitPlural` is given. */
  unit: string
  unitPlural?: string
  min: number
  max: number
  step?: number
}

export function NumberField({
  label,
  description,
  disabled,
  orientation = 'responsive',
  unit,
  unitPlural,
  min,
  max,
  step = 1,
}: NumberFieldProps) {
  const field = useFieldContext<number | undefined>()
  const isInvalid = field.state.meta.errors.length > 0
  const errorId = `${field.name}-error`

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation={orientation}
      htmlFor={field.name}
      invalid={isInvalid}
    >
      <div
        className={cn(
          'flex flex-col gap-2',
          orientation === 'responsive' && '@md/field-group:basis-72',
        )}
      >
        <NumberFieldPrimitive.Root
          id={field.name}
          name={field.name}
          value={field.state.value ?? null}
          onValueChange={(next) => field.handleChange(next ?? undefined)}
          locale={formatLocale()}
          min={min}
          max={max}
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
            <InputGroupAddon align="inline-end">
              <InputGroupText>
                {pluralize(field.state.value ?? 0, unit, unitPlural)}
              </InputGroupText>
            </InputGroupAddon>
          </NumberFieldPrimitive.Group>
        </NumberFieldPrimitive.Root>
        {isInvalid ? (
          <FieldError id={errorId} errors={field.state.meta.errors} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {`${formatNumber(min)} to ${formatNumber(max)} ${pluralize(max, unit, unitPlural)}`}
          </p>
        )}
      </div>
    </FieldRow>
  )
}
