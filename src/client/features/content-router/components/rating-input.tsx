import type { ConditionValue } from '@root/schemas/content-router/content-router.schema'
import { Input } from '@/components/ui/input'
import { StableNumberInput } from './stable-number-input'

interface RatingInputProps {
  operator: string
  value: ConditionValue
  onChange: (value: ConditionValue) => void
  /** Minimum rating value (default: 0) */
  min?: number
  /** Maximum rating value (default: 10) */
  max?: number
  /** Step increment (default: 0.1) */
  step?: number
  /** Label for placeholders (e.g., "rating", "score") */
  label?: string
}

/**
 * Reusable rating input component that handles different operators.
 * Supports between (range), in/notIn (array), and comparison operators.
 */
function RatingInput({
  operator,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.1,
  label = 'rating',
}: RatingInputProps) {
  // Handle "between" operator with min/max range
  if (operator === 'between') {
    const rangeValue =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as { min?: number; max?: number })
        : { min: undefined, max: undefined }

    return (
      <div className="flex space-x-2 flex-1">
        <StableNumberInput
          value={rangeValue.min !== undefined ? rangeValue.min.toString() : ''}
          onChange={(e) => {
            const minVal =
              e.target.value === '' ? undefined : Number(e.target.value)
            onChange({ ...rangeValue, min: minVal })
          }}
          placeholder={`Min ${label} (e.g. ${min + 1})`}
          min={min.toString()}
          max={max.toString()}
          step={step.toString()}
        />
        <span className="self-center text-sm text-muted-foreground">to</span>
        <StableNumberInput
          value={rangeValue.max !== undefined ? rangeValue.max.toString() : ''}
          onChange={(e) => {
            const maxVal =
              e.target.value === '' ? undefined : Number(e.target.value)
            onChange({ ...rangeValue, max: maxVal })
          }}
          placeholder={`Max ${label} (e.g. ${max - 1})`}
          min={min.toString()}
          max={max.toString()}
          step={step.toString()}
        />
      </div>
    )
  }

  // Handle "in" and "notIn" operators with comma-separated values
  if (operator === 'in' || operator === 'notIn') {
    return (
      <Input
        type="text"
        value={
          Array.isArray(value)
            ? value.join(', ')
            : typeof value === 'number'
              ? String(value)
              : ''
        }
        onChange={(e) => {
          const values = e.target.value
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v !== '')
            .map((v) => Number(v))
            .filter((v) => !Number.isNaN(v))
          onChange(values)
        }}
        placeholder={`Enter ${label}s separated by commas (e.g. 7.0, 8.0, 9.0)`}
        className="flex-1"
      />
    )
  }

  // Handle comparison operators (equals, notEquals, greaterThan, lessThan)
  return (
    <StableNumberInput
      value={typeof value === 'number' ? value.toString() : ''}
      onChange={(e) => {
        const rating = e.target.value === '' ? null : Number(e.target.value)
        onChange(rating)
      }}
      placeholder={`Enter ${label} (e.g. 7.5)`}
      min={min.toString()}
      max={max.toString()}
      step={step.toString()}
    />
  )
}

export default RatingInput
