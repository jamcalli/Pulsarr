import type { ConditionValue } from '@root/schemas/content-router/content-router.schema'
import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ImdbRatingInputProps {
  operator: string
  value: ConditionValue
  onChange: (value: ConditionValue) => void
}

// Type for compound IMDB values
interface ImdbCompoundValue {
  rating?: number | number[] | { min?: number; max?: number }
  votes?: number | number[] | { min?: number; max?: number }
}

// Type guard for compound values
function isCompoundValue(value: unknown): value is ImdbCompoundValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('rating' in value || 'votes' in value)
  )
}

// Stable number input component
const StableNumberInput = ({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  id,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  min?: string
  max?: string
  step?: string
  id?: string
}) => {
  const [internalValue, setInternalValue] = useState(value)

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
      step={step}
      id={id}
      className="flex-1"
    />
  )
}

const ImdbRatingInput = ({
  operator,
  value,
  onChange,
}: ImdbRatingInputProps) => {
  // Generate unique IDs
  const votesToggleId = useId()
  const votesInputId = useId()

  // Determine if this is currently a compound value
  const isCurrentlyCompound = isCompoundValue(value)

  // Extract rating and votes from compound value or use simple value as rating
  const ratingValue = isCurrentlyCompound ? value.rating : value
  const votesValue = isCurrentlyCompound ? value.votes : undefined

  // Track if votes are included
  const [includeVotes, setIncludeVotes] = useState(!!votesValue)

  // Stable reference for onChange to avoid stale closures
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Handle rating value changes
  const handleRatingChange = (newRating: ConditionValue) => {
    if (includeVotes) {
      onChangeRef.current({
        rating: newRating,
        votes: votesValue ?? null,
      } as ConditionValue)
    } else {
      onChangeRef.current(newRating)
    }
  }

  // Handle votes toggle
  const handleVotesToggle = (enabled: boolean) => {
    setIncludeVotes(enabled)
    if (enabled) {
      onChangeRef.current({
        rating: ratingValue,
        votes: null,
      } as ConditionValue)
    } else {
      onChangeRef.current(ratingValue ?? null)
    }
  }

  // Handle votes value changes
  const handleVotesChange = (newVotes: number | null) => {
    onChangeRef.current({
      rating: ratingValue,
      votes: newVotes,
    } as ConditionValue)
  }

  // Render rating input based on operator type
  const renderRatingInput = () => {
    if (operator === 'between') {
      const rangeValue =
        typeof ratingValue === 'object' &&
        ratingValue !== null &&
        !Array.isArray(ratingValue)
          ? (ratingValue as { min?: number; max?: number })
          : { min: undefined, max: undefined }

      return (
        <div className="flex space-x-2">
          <StableNumberInput
            value={
              rangeValue.min !== undefined ? rangeValue.min.toString() : ''
            }
            onChange={(e) => {
              const min =
                e.target.value === '' ? undefined : Number(e.target.value)
              const newRange = { ...rangeValue, min }
              handleRatingChange(newRange)
            }}
            placeholder="Min rating (e.g. 7.0)"
            min="1"
            max="10"
            step="0.1"
          />
          <span className="self-center text-sm text-muted-foreground">to</span>
          <StableNumberInput
            value={
              rangeValue.max !== undefined ? rangeValue.max.toString() : ''
            }
            onChange={(e) => {
              const max =
                e.target.value === '' ? undefined : Number(e.target.value)
              const newRange = { ...rangeValue, max }
              handleRatingChange(newRange)
            }}
            placeholder="Max rating (e.g. 9.0)"
            min="1"
            max="10"
            step="0.1"
          />
        </div>
      )
    }

    if (operator === 'in' || operator === 'notIn') {
      return (
        <Input
          type="text"
          value={
            Array.isArray(ratingValue)
              ? ratingValue.join(', ')
              : String(ratingValue ?? '')
          }
          onChange={(e) => {
            const values = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '')
              .map((v) => Number(v))
              .filter((v) => !Number.isNaN(v))
            handleRatingChange(values)
          }}
          placeholder="Enter ratings separated by commas (e.g. 8.0, 8.5, 9.0)"
          className="flex-1"
        />
      )
    }

    // For equals, notEquals, greaterThan, lessThan
    return (
      <StableNumberInput
        value={typeof ratingValue === 'number' ? ratingValue.toString() : ''}
        onChange={(e) => {
          const rating = e.target.value === '' ? null : Number(e.target.value)
          handleRatingChange(rating)
        }}
        placeholder="Enter rating (e.g. 8.0)"
        min="1"
        max="10"
        step="0.1"
      />
    )
  }

  return (
    <div className="space-y-3 flex-1">
      {/* Rating input */}
      <div>{renderRatingInput()}</div>

      {/* Votes toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id={votesToggleId}
          checked={includeVotes}
          onCheckedChange={handleVotesToggle}
        />
        <Label
          htmlFor={votesToggleId}
          className="text-sm text-muted-foreground cursor-pointer"
        >
          Also require minimum vote count
        </Label>
      </div>

      {/* Votes input (when enabled) */}
      {includeVotes && (
        <div>
          <Label htmlFor={votesInputId} className="text-sm font-medium">
            Minimum Vote Count
          </Label>
          <div className="mt-1">
            <StableNumberInput
              id={votesInputId}
              value={
                typeof votesValue === 'number' ? votesValue.toString() : ''
              }
              onChange={(e) => {
                const votes =
                  e.target.value === '' ? null : Number(e.target.value)
                handleVotesChange(votes)
              }}
              placeholder="e.g. 10000"
              min="0"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Content must have at least this many votes on IMDb
          </p>
        </div>
      )}
    </div>
  )
}

export default ImdbRatingInput
