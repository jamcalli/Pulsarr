import { cn } from 'cn'
import { Loader2, Plus } from 'lucide-react'
import type { ComponentProps } from 'react'
import type { z } from 'zod'
import { FieldRow } from '@/components/form/field-row'
import { OptionLabel } from '@/components/form/option-label'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox'
import { FieldDescription, FieldError } from '@/components/ui/field'
import { useComboboxAnchor } from '@/hooks/useComboboxAnchor'
import {
  CREATE_VALUE,
  type CreatableOption,
  useCreatableOptions,
} from '@/hooks/useCreatableOptions'
import { useFieldContext } from '@/lib/form-context'

interface TagsFieldProps {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  labelHidden?: boolean
  placeholder?: string
  emptyText?: string
  options: ReadonlyArray<CreatableOption>
  /** Enables the create row for unmatched input, and must reject with an Error carrying a display message. */
  onCreate?: (label: string) => Promise<CreatableOption> | CreatableOption
  createSchema?: z.ZodType<string, string>
  createLabel?: (input: string) => string
}

function defaultCreateLabel(input: string) {
  return `Create tag "${input}"`
}

export function TagsField({
  label,
  description,
  disabled,
  orientation = 'responsive',
  labelHidden = false,
  placeholder,
  emptyText,
  options,
  onCreate,
  createSchema,
  createLabel = defaultCreateLabel,
}: TagsFieldProps) {
  const field = useFieldContext<string[]>()
  const anchor = useComboboxAnchor()
  const creatable = useCreatableOptions({
    options,
    onCreate,
    createSchema,
    createLabel,
    onCreated: (option) => {
      if (!field.state.value.includes(option.value)) {
        field.pushValue(option.value)
      }
    },
  })
  const { labelFor } = creatable
  const descriptionFor = (value: string) =>
    options.find((option) => option.value === value)?.description
  const errors = creatable.error
    ? [...field.state.meta.errors, { message: creatable.error }]
    : field.state.meta.errors
  const isInvalid = errors.length > 0
  const errorId = `${field.name}-error`

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
        <Combobox
          multiple
          autoHighlight
          items={creatable.items}
          itemToStringLabel={labelFor}
          value={field.state.value}
          disabled={disabled || creatable.creating}
          inputValue={creatable.query}
          onInputValueChange={creatable.setQuery}
          onValueChange={(next, details) => {
            if (next.includes(CREATE_VALUE)) {
              details.cancel()
              void creatable.create()
              return
            }
            field.handleChange(next)
          }}
        >
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(selected: string[]) => (
                <>
                  {selected.map((value) => (
                    <ComboboxChip
                      key={value}
                      removeLabel={`Remove ${labelFor(value)}`}
                    >
                      {labelFor(value)}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id={field.name}
                    placeholder={selected.length ? undefined : placeholder}
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent
            anchor={anchor}
            className={emptyText ? undefined : 'data-empty:hidden'}
          >
            {emptyText && <ComboboxEmpty>{emptyText}</ComboboxEmpty>}
            <ComboboxList>
              {(value: string) => (
                <ComboboxItem key={value} value={value}>
                  <OptionLabel description={descriptionFor(value)}>
                    {value === CREATE_VALUE && <Plus aria-hidden />}
                    {labelFor(value)}
                  </OptionLabel>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {creatable.creating && (
          <FieldDescription role="status" className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating tag...
          </FieldDescription>
        )}
        <FieldError id={errorId} errors={errors} />
      </div>
    </FieldRow>
  )
}
