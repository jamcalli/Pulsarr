import { TagLabelSchema } from '@root/schemas/shared/tag-validation.schema'
import { useState } from 'react'
import type { z } from 'zod'
import { apiErrorMessage } from '@/lib/tanstackApi'

export interface CreatableOption {
  value: string
  label: string
  description?: string
}

interface CreatableOptionsInput {
  options: ReadonlyArray<CreatableOption>
  /** A synchronous result adds the option at once, a promise shows the pending state until it settles. */
  onCreate?: (label: string) => Promise<CreatableOption> | CreatableOption
  /** Validates the typed input before onCreate runs, Radarr's tag label rules unless given. */
  createSchema?: z.ZodType<string, string>
  createLabel: (input: string) => string
  onCreated: (option: CreatableOption) => void
}

/** Item value of the create row, never stored in the field. */
export const CREATE_VALUE = '__create__'

export function useCreatableOptions({
  options,
  onCreate,
  createSchema = TagLabelSchema,
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

  const add = (option: CreatableOption) => {
    setCreated((prev) => [...prev, option])
    setQuery('')
    onCreated(option)
  }

  const create = async () => {
    if (!onCreate) return
    const parsed = createSchema.safeParse(trimmed)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid tag.')
      return
    }
    setError(null)
    const pending = onCreate(parsed.data)
    if (!(pending instanceof Promise)) {
      add(pending)
      return
    }
    setCreating(true)
    try {
      add(await pending)
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
