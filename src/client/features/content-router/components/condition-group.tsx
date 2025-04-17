import { useEffect, useCallback, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PlusCircle, Trash2, LayoutList } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import ConditionBuilder from './condition-builder'
import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema'
import type {
  Condition,
  ConditionGroup,
} from '@root/schemas/content-router/content-router.schema'

interface ConditionGroupComponentProps {
  value: ConditionGroup
  onChange: (value: ConditionGroup) => void
  onRemove?: () => void
  evaluatorMetadata: EvaluatorMetadata[]
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
  isLoading?: boolean
  level?: number
}

const ConditionGroupComponent = ({
  value,
  onChange,
  onRemove,
  evaluatorMetadata,
  genres = [],
  onGenreDropdownOpen,
  isLoading = false,
  level = 0,
}: ConditionGroupComponentProps) => {
  // Keep a reference to the current value
  const valueRef = useRef(value)
  valueRef.current = value

  // Filter out the Conditional Router from options - we only want field-specific evaluators
  const filteredEvaluators = evaluatorMetadata.filter(
    (e) => e.name !== 'Conditional Router',
  )

  // Create a properly structured empty condition with defaults based on the first available field
  const createEmptyCondition = useCallback((): Condition => {
    if (filteredEvaluators.length === 0) {
      return {
        field: '',
        operator: '',
        value: '',
        negate: false,
      }
    }

    // Create a flat list of all fields from all evaluators
    const allFields = filteredEvaluators.flatMap((e) => e.supportedFields)

    // Use the first field
    const firstField = allFields[0]?.name || ''

    // If no field is available, return generic condition
    if (!firstField) {
      return {
        field: '',
        operator: '',
        value: '',
        negate: false,
      }
    }

    // Find evaluator that supports this field
    const fieldEvaluator = filteredEvaluators.find((e) =>
      e.supportedFields.some((f) => f.name === firstField),
    )

    if (!fieldEvaluator) {
      return {
        field: firstField,
        operator: '',
        value: '',
        negate: false,
      }
    }

    // Get the first operator for the first field
    const operators = fieldEvaluator.supportedOperators?.[firstField] || []
    const firstOperator = operators[0]?.name || ''

    // Determine appropriate initial value based on value type
    let initialValue: any = ''
    if (operators[0]?.valueTypes) {
      const valueType = operators[0].valueTypes[0]
      if (valueType === 'number') initialValue = 0
      else if (valueType === 'string[]' || valueType === 'number[]')
        initialValue = []
      else if (valueType === 'object')
        initialValue = { min: undefined, max: undefined }
    }

    return {
      field: firstField,
      operator: firstOperator,
      value: initialValue,
      negate: false,
    }
  }, [filteredEvaluators])

  // Create an empty group with one empty condition
  const createEmptyGroup = useCallback((): ConditionGroup => {
    return {
      operator: 'AND',
      conditions: [createEmptyCondition()],
      negate: false,
    }
  }, [createEmptyCondition])

  const isInitialized = useRef(false)

  // Initialize conditions with proper fields when metadata is loaded - ONCE
  useEffect(() => {
    // Skip if we've already initialized or if we don't have evaluators
    if (isInitialized.current || filteredEvaluators.length === 0) {
      return
    }

    // Skip if we already have conditions
    if (value.conditions && value.conditions.length > 0) {
      isInitialized.current = true
      return
    }

    // Create a single empty condition - this should only run once
    const emptyCondition = createEmptyCondition()

    // Use setTimeout to break potential update cycles
    const timer = setTimeout(() => {
      onChange({
        ...value,
        conditions: [emptyCondition],
      })
      isInitialized.current = true
    }, 0)

    return () => clearTimeout(timer)
    // Only depend on filteredEvaluators.length - explicitly NOT including value or functions
  }, [filteredEvaluators.length])

  // Handle toggling the negate flag
  const handleToggleNegate = useCallback(() => {
    onChange({
      ...valueRef.current,
      negate: !valueRef.current.negate,
    })
  }, [onChange])

  // Handle changing the logical operator (AND/OR)
  const handleOperatorChange = useCallback(
    (newOperator: 'AND' | 'OR') => {
      onChange({
        ...valueRef.current,
        operator: newOperator,
      })
    },
    [onChange],
  )

  // Add a new empty condition to the group
  const handleAddCondition = useCallback(() => {
    if (filteredEvaluators.length === 0) {
      console.warn('Cannot add condition: No evaluator metadata available')
      return
    }

    const newCondition = createEmptyCondition()

    // Ensure value.conditions is an array before spreading
    const currentConditions = Array.isArray(valueRef.current.conditions)
      ? valueRef.current.conditions
      : []

    onChange({
      ...valueRef.current,
      conditions: [...currentConditions, newCondition],
    })
  }, [onChange, createEmptyCondition, filteredEvaluators.length])

  // Add a new nested condition group to the group
  const handleAddGroup = useCallback(() => {
    const newGroup = createEmptyGroup()

    // Ensure value.conditions is an array before spreading
    const currentConditions = Array.isArray(valueRef.current.conditions)
      ? valueRef.current.conditions
      : []

    onChange({
      ...valueRef.current,
      conditions: [...currentConditions, newGroup],
    })
  }, [onChange, createEmptyGroup])

  // Update a specific condition in the group
  const handleUpdateCondition = useCallback(
    (index: number, updatedCondition: Condition | ConditionGroup) => {
      // Ensure value.conditions is an array before modifying
      if (!Array.isArray(valueRef.current.conditions)) {
        const newConditions = [updatedCondition]
        onChange({
          ...valueRef.current,
          conditions: newConditions,
        })
        return
      }

      const newConditions = [...valueRef.current.conditions]
      newConditions[index] = updatedCondition
      onChange({
        ...valueRef.current,
        conditions: newConditions,
      })
    },
    [onChange],
  )

  // Remove a condition from the group
  const handleRemoveCondition = useCallback(
    (index: number) => {
      // Ensure value.conditions is an array before filtering
      if (!Array.isArray(valueRef.current.conditions)) {
        onChange({
          ...valueRef.current,
          conditions: [createEmptyCondition()],
        })
        return
      }

      const newConditions = valueRef.current.conditions.filter(
        (_: Condition | ConditionGroup, i: number) => i !== index,
      )
      onChange({
        ...valueRef.current,
        conditions:
          newConditions.length > 0 ? newConditions : [createEmptyCondition()],
      })
    },
    [onChange, createEmptyCondition],
  )

  if (isLoading) {
    return (
      <div className="space-y-4 border-l-2 pl-4 border-muted">
        <div className="flex justify-between">
          <Skeleton className="h-10 w-[30%]" />
          <div>
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  // Generate border color based on nesting level
  const getLevelColor = () => {
    const colors = [
      'border-primary',
      'border-secondary',
      'border-accent',
      'border-fun',
      'border-green',
    ]
    return colors[level % colors.length]
  }

  // Ensure value.conditions is always an array
  const conditions = Array.isArray(value.conditions) ? value.conditions : []

  return (
    <div className={`border-l-2 pl-4 ${getLevelColor()}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <Label className="flex items-center space-x-2 cursor-pointer">
            <Switch
              checked={value.negate || false}
              onCheckedChange={handleToggleNegate}
            />
            <span>NOT</span>
          </Label>
          <Select
            value={value.operator}
            onValueChange={(val) => handleOperatorChange(val as 'AND' | 'OR')}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex space-x-2">
          {onRemove && (
            <Button variant="noShadow" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4 mr-1" />
              <span className="hidden md:inline">Remove Group</span>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {conditions.map(
          (condition: Condition | ConditionGroup, index: number) => {
            // Check if this is a condition group or a single condition
            const isGroup =
              condition &&
              typeof condition === 'object' &&
              'operator' in condition &&
              'conditions' in condition

            return (
              <div key={`condition-${index}`} className="relative">
                {isGroup ? (
                  // Render nested group
                  <ConditionGroupComponent
                    value={condition as ConditionGroup}
                    onChange={(updatedGroup) =>
                      handleUpdateCondition(index, updatedGroup)
                    }
                    onRemove={() => handleRemoveCondition(index)}
                    evaluatorMetadata={evaluatorMetadata}
                    genres={genres}
                    onGenreDropdownOpen={onGenreDropdownOpen}
                    isLoading={isLoading}
                    level={level + 1}
                  />
                ) : (
                  // Render single condition
                  <ConditionBuilder
                    value={condition as Condition}
                    onChange={(updatedCondition) =>
                      handleUpdateCondition(index, updatedCondition)
                    }
                    onRemove={() => handleRemoveCondition(index)}
                    evaluatorMetadata={evaluatorMetadata}
                    genres={genres}
                    onGenreDropdownOpen={onGenreDropdownOpen}
                    isLoading={isLoading}
                  />
                )}
              </div>
            )
          },
        )}
      </div>

      <div className="flex space-x-2 mt-4">
        <Button
          variant="noShadow"
          size="sm"
          type="button"
          onClick={handleAddCondition}
          disabled={filteredEvaluators.length === 0}
        >
          <PlusCircle className="h-4 w-4 mr-1" />
          Add Condition
        </Button>
        <Button
          variant="noShadow"
          size="sm"
          type="button"
          onClick={handleAddGroup}
          disabled={filteredEvaluators.length === 0}
        >
          <LayoutList className="h-4 w-4 mr-1" />
          Add Group
        </Button>
      </div>
    </div>
  )
}

export default ConditionGroupComponent
