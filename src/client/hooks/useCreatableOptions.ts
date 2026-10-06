import { TagLabelSchema } from '@root/schemas/shared/tag-validation.schema'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/tanstackApi'

export interface CreatableOption {
  value: string
  label: string
}

interface CreatableOptionsInput {
  options: ReadonlyArray<CreatableOption>
  onCreate?: (label: string) => Promise<CreatableOption>
  createLabel: (input: string) => string
  onCreated: (option: CreatableOption) => void
}

/** Item value of the create row, never stored in the field. */
export const CREATE_VALUE = '__create__'

export function useCreatableOptions({
  options,
  onCreate,
  createLabel,
  onCreated,
}: CreatableOptionsInput) {
  const [query, setQuery] = useState('')
  const [created, setCreated] = useState<CreatableOption[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const known = [
    ...options,
    ...created.filter(
      (option) => !options.some((existing) => existing.value === option.value),
    ),
  ]
  const trimmed = query.trim()
  const canCreate =
    onCreate !== undefined &&
    trimmed !== '' &&
    !known.some(
      (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
    )
  const values = known.map((option) => option.value)

  const create = async () => {
    if (!onCreate) return
    const parsed = TagLabelSchema.safeParse(trimmed)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid tag.')
      return
    }
    setError(null)
    setCreating(true)
    try {
      const option = await onCreate(parsed.data)
      setCreated((prev) => [...prev, option])
      setQuery('')
      onCreated(option)
    } catch (createError) {
      setError(
        apiErrorMessage(createError) ?? 'Tag could not be created. Try again.',
      )
    } finally {
      setCreating(false)
    }
  }

  return {
    items: canCreate ? [...values, CREATE_VALUE] : values,
    query,
    setQuery: (next: string) => {
      setError(null)
      setQuery(next)
    },
    creating,
    error,
    create,
    labelFor: (value: string) =>
      value === CREATE_VALUE
        ? createLabel(trimmed)
        : (known.find((option) => option.value === value)?.label ?? value),
  }
}
