import type { ConditionValue } from '@root/schemas/content-router/content-router.schema'
import { useId, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import RatingInput from '@/features/content-router/components/rating-input'
import { StableNumberInput } from './stable-number-input'

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
    if (includeVotes && votesValue !== undefined && votesValue !== null) {
      onChangeRef.current({
        rating: newRating,
        votes: votesValue,
      } as ConditionValue)
    } else {
      onChangeRef.current(newRating)
    }
  }

  // Handle votes toggle
  const handleVotesToggle = (enabled: boolean) => {
    setIncludeVotes(enabled)
    if (enabled) {
      // Don't add votes property until user enters a value
      onChangeRef.current((ratingValue ?? null) as ConditionValue)
    } else {
      onChangeRef.current(ratingValue ?? null)
    }
  }

  // Handle votes value changes
  const handleVotesChange = (newVotes: number | null) => {
    if (newVotes === null || newVotes === undefined) {
      // If votes are cleared, send just the rating value
      onChangeRef.current((ratingValue ?? null) as ConditionValue)
    } else {
      // Only create compound object when votes has an actual value
      onChangeRef.current({
        rating: ratingValue,
        votes: newVotes,
      } as ConditionValue)
    }
  }

  return (
    <div className="space-y-3 flex-1">
      {/* Rating input - using shared RatingInput component */}
      <div>
        <RatingInput
          operator={operator}
          value={ratingValue ?? null}
          onChange={handleRatingChange}
          min={1}
          max={10}
          step={0.1}
          label="rating"
        />
      </div>

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
