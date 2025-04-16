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

const ConditionInput = ({
  field,
  operator,
  valueTypes = [],
  value,
  onChange,
  genres = [],
  onGenreDropdownOpen,
}: ConditionInputProps) => {
  const inputRef = useRef(null)

  // Handle the specific input requirements based on valueTypes
  if (!operator || valueTypes.length === 0) return null

  // Create a properly structured field prop for multi-select components
  const createFormField = (
    fieldName: string,
  ): ControllerRenderProps<any, any> => {
    return {
      name: fieldName,
      value: Array.isArray(value) ? value : [value as string],
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

  // Special case for genres field
  if (field === 'genre' || field === 'genres') {
    const genreField = createFormField('genre')

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
    const userField = createFormField('user')

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
          <Input
            type="number"
            min="1900"
            max="2100"
            value={
              rangeValue.min !== undefined ? rangeValue.min.toString() : ''
            }
            onChange={(e) => {
              const min =
                e.target.value === '' ? undefined : Number(e.target.value)
              onChange({ ...rangeValue, min })
            }}
            placeholder="Min year"
            className="flex-1"
          />
          <span className="self-center">to</span>
          <Input
            type="number"
            min="1900"
            max="2100"
            value={
              rangeValue.max !== undefined ? rangeValue.max.toString() : ''
            }
            onChange={(e) => {
              const max =
                e.target.value === '' ? undefined : Number(e.target.value)
              onChange({ ...rangeValue, max })
            }}
            placeholder="Max year"
            className="flex-1"
          />
        </div>
      )
    }

    // For year with in/notIn operators
    if (operator === 'in' || operator === 'notIn') {
      return (
        <Input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : String(value || '')}
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '')
              .map((v) => Number(v))
              .filter((v) => !Number.isNaN(v))
            onChange(arrayValue)
          }}
          placeholder="Enter years separated by commas (e.g. 1999, 2000, 2001)"
          className="flex-1"
        />
      )
    }

    // For year with other operators
    return (
      <Input
        type="number"
        min="1900"
        max="2100"
        value={typeof value === 'number' ? value.toString() : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="Enter year (e.g. 2023)"
        className="flex-1"
      />
    )
  }

  // Special handling for language field
  if (field === 'language' || field === 'originalLanguage') {
    if (operator === 'in' || operator === 'notIn') {
      return (
        <Input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : String(value || '')}
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '')
            onChange(arrayValue)
          }}
          placeholder="Enter languages separated by commas (e.g. English, French, Spanish)"
          className="flex-1"
        />
      )
    } else {
      return (
        <Input
          type="text"
          value={typeof value === 'string' ? value : String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter language (e.g. English)"
          className="flex-1"
        />
      )
    }
  }

  // Handle arrays for "in" operators
  if (
    (operator === 'in' || operator === 'notIn') &&
    (valueTypes.includes('string[]') || valueTypes.includes('number[]'))
  ) {
    return (
      <Input
        type="text"
        value={Array.isArray(value) ? value.join(', ') : String(value || '')}
        onChange={(e) => {
          const arrayValue = e.target.value
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v !== '')

          // Convert to numbers if valueTypes includes 'number[]'
          if (valueTypes.includes('number[]')) {
            const numericValues = arrayValue
              .map((v) => Number(v))
              .filter((v) => !Number.isNaN(v))
            onChange(numericValues)
          } else {
            onChange(arrayValue)
          }
        }}
        placeholder="Enter values separated by commas"
        className="flex-1"
      />
    )
  }

  // Standard number input for numeric fields
  if (valueTypes.includes('number')) {
    return (
      <Input
        type="number"
        value={typeof value === 'number' ? value.toString() : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="Enter a number"
        className="flex-1"
      />
    )
  }

  // Standard text input for string fields
  if (valueTypes.includes('string')) {
    return (
      <Input
        type="text"
        value={typeof value === 'string' ? value : String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter a value"
        className="flex-1"
      />
    )
  }

  // Fallback text input for any other type
  return (
    <Input
      type="text"
      value={typeof value === 'string' ? value : String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter a value"
      className="flex-1"
    />
  )
}

export default ConditionInput
