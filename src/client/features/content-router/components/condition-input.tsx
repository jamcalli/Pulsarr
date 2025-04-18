import { useState, useEffect, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import GenreMultiSelect from '@/components/ui/genre-multi-select'
import UserMultiSelect from '@/components/ui/user-multi-select'
import { useConfigStore } from '@/stores/configStore'
import type { ControllerRenderProps, FieldPath } from 'react-hook-form'
import type { ConditionValue } from '@root/schemas/content-router/content-router.schema'

interface FieldState {
  [key: string]: string | string[]
}

interface ConditionInputProps {
  field: string
  operator: string
  valueTypes: string[]
  value: ConditionValue
  onChange: (value: ConditionValue) => void
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
  inputId?: string
}

// Text input with stable identity
const StableTextInput = ({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
}) => {
  // Keep an internal state to maintain focus
  const [internalValue, setInternalValue] = useState(value)

  // Update internal value when external value changes significantly
  useEffect(() => {
    setInternalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value)
    onChange(e)
  }

  return (
    <Input
      type={type}
      value={internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      className="flex-1"
    />
  )
}

// Number input with stable identity
const StableNumberInput = ({
  value,
  onChange,
  placeholder,
  min,
  max,
  id,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  min?: string
  max?: string
  id?: string
}) => {
  // Keep an internal state to maintain focus
  const [internalValue, setInternalValue] = useState(value)

  // Update internal value when external value changes significantly
  useEffect(() => {
    setInternalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value)
    onChange(e)
  }

  return (
    <Input
      type="number"
      id={id}
      value={internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      min={min}
      max={max}
      className="flex-1"
    />
  )
}

/**
 * Renders an adaptive input control for a conditional form, selecting the appropriate input type based on the field, operator, and allowed value types.
 *
 * Depending on the context, this component displays text inputs, number inputs, range inputs, single-select dropdowns, or multi-select components for fields such as genre, user, year, and language. It manages value parsing and formatting for single and multi-value inputs, and integrates with a global config store to fetch user data as needed.
 *
 * @param field - The name of the field being filtered.
 * @param operator - The comparison operator for the condition.
 * @param valueTypes - Allowed value types for the field and operator.
 * @param value - The current value of the input.
 * @param onChange - Callback invoked when the input value changes.
 * @param genres - Optional list of genres for genre selection fields.
 * @param onGenreDropdownOpen - Optional callback when the genre dropdown is opened.
 * @param inputId - Optional ID for the input element.
 *
 * @returns The appropriate input element for the given field and operator, or null if insufficient information is provided.
 */
function ConditionInput({
  field,
  operator,
  valueTypes = [],
  value,
  onChange,
  genres = [],
  onGenreDropdownOpen,
  inputId,
}: ConditionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  // Create a ref to always hold the latest onChange function
  const onChangeRef = useRef<(value: ConditionValue) => void>(onChange)

  // Update the ref whenever onChange changes
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Get users from the config store
  const users = useConfigStore((state) => state.users)
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const isInitialized = useConfigStore((state) => state.isInitialized)
  const initialize = useConfigStore((state) => state.initialize)

  // Initialize the config store if needed
  useEffect(() => {
    const initializeStore = async () => {
      if (!isInitialized) {
        await initialize()
      }
      await fetchUserData()
    }

    initializeStore()
  }, [initialize, isInitialized, fetchUserData])

  // Store handler functions to keep them stable between renders
  const handlers = useRef({
    handleTextChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      onChangeRef.current(e.target.value)
    },

    handleNumberChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Fix: Handle empty input correctly
      const value = e.target.value === '' ? null : Number(e.target.value)
      onChangeRef.current(value as ConditionValue)
    },

    handleArrayChange: (
      e: React.ChangeEvent<HTMLInputElement>,
      isNumeric = false,
    ) => {
      const arrayValue = e.target.value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '')

      if (isNumeric) {
        const numericValues = arrayValue
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v))
        onChangeRef.current(numericValues)
      } else {
        onChangeRef.current(arrayValue)
      }
    },

    handleRangeMinChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Make a copy of the current value to avoid direct mutation
      const currentValue =
        typeof valueRef.current === 'object' && valueRef.current !== null
          ? { ...(valueRef.current as { min?: number; max?: number }) }
          : { min: undefined, max: undefined }

      const min = e.target.value === '' ? undefined : Number(e.target.value)
      onChangeRef.current({ ...currentValue, min })
    },

    handleRangeMaxChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      type RangeValue = { min?: number; max?: number }

      const currentValue: RangeValue =
        typeof valueRef.current === 'object' && valueRef.current !== null
          ? { ...(valueRef.current as RangeValue) }
          : { min: undefined, max: undefined }

      const max = e.target.value === '' ? undefined : Number(e.target.value)
      onChangeRef.current({ ...currentValue, max })
    },
  })

  // Update handlers ref when onChangeRef changes
  useEffect(() => {
    handlers.current = {
      handleTextChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        onChangeRef.current(e.target.value)
      },

      handleNumberChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value === '' ? null : Number(e.target.value)
        onChangeRef.current(value as ConditionValue)
      },

      handleArrayChange: (
        e: React.ChangeEvent<HTMLInputElement>,
        isNumeric = false,
      ) => {
        const arrayValue = e.target.value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '')

        if (isNumeric) {
          const numericValues = arrayValue
            .map((v) => Number(v))
            .filter((v) => !Number.isNaN(v))
          onChangeRef.current(numericValues)
        } else {
          onChangeRef.current(arrayValue)
        }
      },

      handleRangeMinChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const currentValue =
          typeof valueRef.current === 'object' && valueRef.current !== null
            ? { ...(valueRef.current as { min?: number; max?: number }) }
            : { min: undefined, max: undefined }

        const min = e.target.value === '' ? undefined : Number(e.target.value)
        onChangeRef.current({ ...currentValue, min })
      },

      handleRangeMaxChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        type RangeValue = { min?: number; max?: number }

        const currentValue: RangeValue =
          typeof valueRef.current === 'object' && valueRef.current !== null
            ? { ...(valueRef.current as RangeValue) }
            : { min: undefined, max: undefined }

        const max = e.target.value === '' ? undefined : Number(e.target.value)
        onChangeRef.current({ ...currentValue, max })
      },
    }
  }, [])

  // Handle the specific input requirements based on valueTypes
  if (!operator || valueTypes.length === 0) return null

  // Create a properly structured field prop for multi-select components
  const createFormField = (
    fieldName: string,
    isNumeric = false,
  ): ControllerRenderProps<FieldState, FieldPath<FieldState>> => {
    // For react-hook-form typing
    type AllowedValue = string | string[]
    const isEmpty =
      (Array.isArray(value) && value.length === 0) ||
      value === '' ||
      value === undefined ||
      value === null

    // Convert all values to appropriate type (string or number)
    const formattedValue = Array.isArray(value)
      ? value.map((item) => (isNumeric ? Number(item) : String(item)))
      : [
          isNumeric
            ? value === ''
              ? 0
              : Number(value || 0)
            : String(value || ''),
        ]

    return {
      name: fieldName as FieldPath<FieldState>,
      value: isEmpty
        ? []
        : (formattedValue.map((v) => String(v)) as AllowedValue),
      onChange: (newValue: unknown) => {
        if (Array.isArray(newValue)) {
          onChangeRef.current(
            newValue.map((item) =>
              isNumeric ? Number(item) : String(item),
            ) as ConditionValue,
          )
        } else {
          onChangeRef.current([
            isNumeric
              ? newValue === ''
                ? 0
                : Number(newValue || 0)
              : String(newValue || ''),
          ] as ConditionValue)
        }
      },
      onBlur: () => {},
      ref: (instance: HTMLInputElement | null) => {
        if (inputRef.current !== instance) {
          inputRef.current = instance
        }
      },
    }
  }

  const createGenreFormField = (): ControllerRenderProps<
    Record<string, unknown>,
    'genre'
  > => {
    const isEmpty =
      (Array.isArray(value) && value.length === 0) ||
      value === '' ||
      value === undefined ||
      value === null

    // Convert all values to strings
    const stringValue = Array.isArray(value)
      ? value.map((item) => String(item))
      : [String(value || '')]

    return {
      name: 'genre', // Use the literal "genre" as required by GenreMultiSelect
      value: isEmpty ? [] : stringValue,
      onChange: (newValue: unknown) => {
        // Handle conversion for onChange callback
        if (Array.isArray(newValue)) {
          onChangeRef.current(newValue.map((item) => String(item)))
        } else {
          onChangeRef.current([String(newValue || '')])
        }
      },
      onBlur: () => {},
      ref: (instance: HTMLInputElement | null) => {
        if (inputRef.current !== instance) {
          inputRef.current = instance
        }
      },
    }
  }

  // For the genre field
  if (field === 'genre' || field === 'genres') {
    // Single value operators
    if (operator === 'contains' || operator === 'notContains') {
      return (
        <div className="flex-1">
          <Select
            value={typeof value === 'string' ? value : ''}
            onValueChange={(val) => onChangeRef.current(val)}
            disabled={!genres.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a genre" />
            </SelectTrigger>
            <SelectContent>
              {genres.map((genre) => (
                <SelectItem key={genre} value={genre}>
                  {genre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // For 'equals' which can be either single or multi
    if (operator === 'equals') {
      // If it's currently a string, use single select
      if (typeof value === 'string') {
        return (
          <div className="flex-1">
            <Select
              value={value}
              onValueChange={(val) => onChangeRef.current(val)}
              disabled={!genres.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a genre" />
              </SelectTrigger>
              <SelectContent>
                {genres.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }
    }

    // Use multi-select for operators expecting arrays (in, notIn)
    // or equals when already multi-value
    const genreField = createGenreFormField()
    return (
      <div className="flex-1">
        <GenreMultiSelect
          field={genreField}
          genres={genres}
          onDropdownOpen={onGenreDropdownOpen}
        />
      </div>
    )
  }

  // Special case for user field
  if (field === 'user' || field === 'userId' || field === 'userName') {
    // Check if we should handle this as numeric based on valueTypes
    const isNumeric =
      valueTypes.includes('number') || valueTypes.includes('number[]')

    // Single value operator (equals)
    if (operator === 'equals') {
      // If it's currently a string or number, use single select
      if (typeof value === 'string' || typeof value === 'number') {
        return (
          <div className="flex-1">
            <Select
              value={value.toString()}
              onValueChange={(val) => {
                // Convert to number if this is a numeric field
                const parsedVal = isNumeric ? Number(val) : val
                onChangeRef.current(parsedVal)
              }}
              disabled={!users?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.alias ? `${user.name} (${user.alias})` : user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }
    }

    // For multi-select operators (in) or when we already have multiple values
    const userField = createFormField('user', isNumeric)
    return (
      <div className="flex-1">
        <UserMultiSelect field={userField} />
      </div>
    )
  }

  // Special handling for year field
  if (field === 'year') {
    // For year with between operator
    if (operator === 'between') {
      const rangeValue =
        typeof value === 'object' && value !== null
          ? (value as { min?: number; max?: number })
          : { min: undefined, max: undefined }

      return (
        <div className="flex space-x-2 flex-1">
          <StableNumberInput
            value={
              rangeValue.min !== undefined ? rangeValue.min.toString() : ''
            }
            onChange={handlers.current.handleRangeMinChange}
            placeholder="Min year"
            min="1900"
            max="2100"
          />
          <span className="self-center">to</span>
          <StableNumberInput
            value={
              rangeValue.max !== undefined ? rangeValue.max.toString() : ''
            }
            onChange={handlers.current.handleRangeMaxChange}
            placeholder="Max year"
            min="1900"
            max="2100"
          />
        </div>
      )
    }

    // For year with in/notIn operators
    if (operator === 'in' || operator === 'notIn') {
      return (
        <StableTextInput
          value={Array.isArray(value) ? value.join(', ') : String(value || '')}
          onChange={(e) => handlers.current.handleArrayChange(e, true)}
          placeholder="Enter years separated by commas (e.g. 1999, 2000, 2001)"
        />
      )
    }

    // For year with other operators
    return (
      <StableNumberInput
        value={typeof value === 'number' ? value.toString() : ''}
        onChange={handlers.current.handleNumberChange}
        placeholder="Enter year (e.g. 2023)"
        min="1900"
        max="2100"
      />
    )
  }

  // Special handling for language field
  if (field === 'language' || field === 'originalLanguage') {
    if (operator === 'in' || operator === 'notIn') {
      return (
        <StableTextInput
          value={Array.isArray(value) ? value.join(', ') : String(value || '')}
          onChange={(e) => handlers.current.handleArrayChange(e, false)}
          placeholder="Enter languages separated by commas (e.g. English, French, Spanish)"
        />
      )
    }
    return (
      <StableTextInput
        value={typeof value === 'string' ? value : String(value || '')}
        onChange={handlers.current.handleTextChange}
        placeholder="Enter language (e.g. English)"
      />
    )
  }

  // Handle arrays for "in" operators
  if (
    (operator === 'in' || operator === 'notIn') &&
    (valueTypes.includes('string[]') || valueTypes.includes('number[]'))
  ) {
    const isNumeric = valueTypes.includes('number[]')

    return (
      <StableTextInput
        value={Array.isArray(value) ? value.join(', ') : String(value || '')}
        onChange={(e) => handlers.current.handleArrayChange(e, isNumeric)}
        placeholder="Enter values separated by commas"
      />
    )
  }

  // Standard number input for numeric fields
  if (valueTypes.includes('number')) {
    return (
      <StableNumberInput
        id={inputId}
        value={typeof value === 'number' ? value.toString() : ''}
        onChange={handlers.current.handleNumberChange}
        placeholder="Enter a number"
      />
    )
  }

  // Standard text input for string fields
  if (valueTypes.includes('string')) {
    return (
      <StableTextInput
        value={typeof value === 'string' ? value : String(value || '')}
        onChange={handlers.current.handleTextChange}
        placeholder="Enter a value"
      />
    )
  }

  // Fallback text input for any other type
  return (
    <StableTextInput
      value={typeof value === 'string' ? value : String(value || '')}
      onChange={handlers.current.handleTextChange}
      placeholder="Enter a value"
    />
  )
}

export default ConditionInput
