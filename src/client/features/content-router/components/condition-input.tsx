// src/client/features/content-router/components/condition-input.tsx
import { useState, useEffect, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import GenreMultiSelect from '@/components/ui/genre-multi-select'
import UserMultiSelect from '@/components/ui/user-multi-select'
import type { ControllerRenderProps } from 'react-hook-form'

// Define value types
type ConditionValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | {
      min?: number
      max?: number
    }

interface ConditionInputProps {
  field: string
  operator: string
  valueTypes: string[]
  value: ConditionValue
  onChange: (value: ConditionValue) => void
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
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
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  min?: string
  max?: string
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
      value={internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      min={min}
      max={max}
      className="flex-1"
    />
  )
}

function ConditionInput({
  field,
  operator,
  valueTypes = [],
  value,
  onChange,
  genres = [],
  onGenreDropdownOpen,
}: ConditionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  // Store handler functions to keep them stable between renders
  const handlers = useRef({
    handleTextChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },

    handleNumberChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value))
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
        onChange(numericValues)
      } else {
        onChange(arrayValue)
      }
    },

    handleRangeMinChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Make a copy of the current value to avoid direct mutation
      const currentValue =
        typeof valueRef.current === 'object' && valueRef.current !== null
          ? { ...(valueRef.current as any) }
          : { min: undefined, max: undefined }

      const min = e.target.value === '' ? undefined : Number(e.target.value)
      onChange({ ...currentValue, min })
    },

    handleRangeMaxChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Make a copy of the current value to avoid direct mutation
      const currentValue =
        typeof valueRef.current === 'object' && valueRef.current !== null
          ? { ...(valueRef.current as any) }
          : { min: undefined, max: undefined }

      const max = e.target.value === '' ? undefined : Number(e.target.value)
      onChange({ ...currentValue, max })
    },
  })

  // Handle the specific input requirements based on valueTypes
  if (!operator || valueTypes.length === 0) return null

  // Create a properly structured field prop for multi-select components
  const createFormField = (
    fieldName: string,
    placeholder: string,
  ): ControllerRenderProps<any, any> => {
    const isEmpty =
      (Array.isArray(value) && value.length === 0) ||
      value === '' ||
      value === undefined ||
      value === null

    return {
      name: fieldName,
      value: isEmpty ? [] : Array.isArray(value) ? value : [value as string],
      onChange: (newValue) =>
        onChange(Array.isArray(newValue) ? newValue : [newValue]),
      onBlur: () => {},
      ref: (instance: any) => {
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
          onValueChange={(val) => onChange(val)}
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
    );
  }
  
  // For 'equals' which can be either single or multi
  if (operator === 'equals') {
    // If it's currently a string, use single select
    if (typeof value === 'string') {
      return (
        <div className="flex-1">
          <Select
            value={value}
            onValueChange={(val) => onChange(val)}
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
      );
    }
  }
  
  // Use multi-select for operators expecting arrays (in, notIn) 
  // or equals when already multi-value
  const genreField = createFormField('genre', 'Select genres');
  return (
    <div className="flex-1">
      <GenreMultiSelect
        field={genreField}
        genres={genres}
        onDropdownOpen={onGenreDropdownOpen}
      />
    </div>
  );
}

  // Special case for user field
  if (field === 'user' || field === 'userId' || field === 'userName') {
    const userField = createFormField('user', 'Select users')

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
