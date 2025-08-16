import type {
  ComparisonOperator,
  Condition,
  ConditionGroup,
} from '@root/schemas/content-router/content-router.schema'
import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema'
import { HelpCircle, LayoutList, PlusCircle, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import ConditionBuilder from '@/features/content-router/components/condition-builder'
import {
  isCondition,
  isConditionGroup,
} from '@/features/content-router/types/route-types'
import { generateUUID } from '@/features/content-router/utils/utils'

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

  // Helper function to check if there are any valid evaluator branches
  const hasValidEvaluatorBranch = useCallback(() => {
    return filteredEvaluators.some((evaluator) =>
      evaluator.supportedFields.some(
        (field) =>
          (evaluator.supportedOperators?.[field.name] || []).length > 0,
      ),
    )
  }, [filteredEvaluators])

  // Create a properly structured empty condition with defaults based on the first available field
  const createEmptyCondition = useCallback((): Condition => {
    if (filteredEvaluators.length === 0) {
      return {
        field: '',
        operator: 'equals' as ComparisonOperator,
        value: null,
        negate: false,
        _cid: generateUUID(),
      }
    }

    // Find first field with valid operators
    let firstField = ''
    let firstOperator: ComparisonOperator = 'equals'
    let foundValid = false

    for (const evaluator of filteredEvaluators) {
      for (const field of evaluator.supportedFields) {
        const operators = evaluator.supportedOperators?.[field.name] ?? []
        if (operators.length > 0) {
          firstField = field.name
          firstOperator = operators[0].name as ComparisonOperator
          foundValid = true
          break
        }
      }
      if (foundValid) break
    }

    if (!foundValid) {
      console.error(
        '[ConditionGroup] No valid field/operator combinations found',
      )
      return {
        field: '',
        operator: 'equals' as ComparisonOperator,
        value: null,
        negate: false,
        _cid: generateUUID(),
      }
    }

    return {
      field: firstField,
      operator: firstOperator,
      value: null,
      negate: false,
      _cid: generateUUID(),
    }
  }, [filteredEvaluators])

  // Create an empty group with one empty condition
  const createEmptyGroup = useCallback((): ConditionGroup => {
    return {
      operator: 'AND',
      conditions: [createEmptyCondition()],
      negate: false,
      _cid: generateUUID(),
    }
  }, [createEmptyCondition])

  const isInitialized = useRef(false)
  const hasInitialConditionsRef = useRef(false)

  // Store initial value in a ref to avoid linter issues
  const initialValueRef = useRef(value)

  // Run this effect once on mount to check initial conditions and set up
  useEffect(() => {
    // Skip if we've already initialized or if we don't have evaluators
    if (isInitialized.current || filteredEvaluators.length === 0) {
      return
    }

    // Check conditions only once and store result in ref
    if (!hasInitialConditionsRef.current) {
      hasInitialConditionsRef.current = true

      // Get the value from our ref to avoid dependency on the prop
      const currentValue = initialValueRef.current

      // If we already have conditions, mark as initialized and return
      if (currentValue.conditions && currentValue.conditions.length > 0) {
        isInitialized.current = true
        return
      }

      // Create a single empty condition - this should only run once
      const emptyCondition = createEmptyCondition()

      // Use setTimeout to break potential update cycles
      const timer = setTimeout(() => {
        onChange({
          ...valueRef.current,
          conditions: [emptyCondition],
        })
        isInitialized.current = true
      }, 0)

      return () => clearTimeout(timer)
    }
  }, [filteredEvaluators.length, onChange, createEmptyCondition])

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
    if (!hasValidEvaluatorBranch()) {
      console.warn(
        'Cannot add condition: No valid evaluator field/operator combinations available',
      )
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
  }, [onChange, createEmptyCondition, hasValidEvaluatorBranch])

  // Add a new nested condition group to the group
  const handleAddGroup = useCallback(() => {
    if (!hasValidEvaluatorBranch()) {
      console.warn(
        'Cannot add group: No valid evaluator field/operator combinations available',
      )
      return
    }

    const newGroup = createEmptyGroup()

    // Ensure value.conditions is an array before spreading
    const currentConditions = Array.isArray(valueRef.current.conditions)
      ? valueRef.current.conditions
      : []

    onChange({
      ...valueRef.current,
      conditions: [...currentConditions, newGroup],
    })
  }, [onChange, createEmptyGroup, hasValidEvaluatorBranch])

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
      const newConditions = [...valueRef.current.conditions]
      newConditions.splice(index, 1)

      // If this was the last condition, add an empty condition using the helper
      if (newConditions.length === 0) {
        newConditions.push(createEmptyCondition())
      }

      onChange({
        ...valueRef.current,
        conditions: newConditions,
      })
    },
    [onChange, createEmptyCondition],
  )

  if (isLoading) {
    return (
      <div className="space-y-4 border-l-2 pl-4 border-foreground">
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
    <div className={`border-l-2 pl-4 border-foreground ${getLevelColor()}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center space-x-2">
                  <Label className="flex items-center space-x-2 cursor-pointer">
                    <Switch
                      checked={value.negate || false}
                      onCheckedChange={handleToggleNegate}
                      variant="danger"
                    />
                    <span className="text-foreground">NOT</span>
                  </Label>
                  <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  When enabled, inverts the entire result of this group. This
                  matches content that does NOT satisfy the combined conditions
                  below.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <Select
                    value={value.operator}
                    onValueChange={(val) =>
                      handleOperatorChange(val as 'AND' | 'OR')
                    }
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  AND: All conditions must match for content to be routed. OR:
                  Any condition can match for content to be routed.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex space-x-2">
          {onRemove && (
            <Button variant="error" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4 mr-1" />
              <span className="hidden md:inline">Remove Group</span>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {conditions.map(
          (condition: Condition | ConditionGroup, index: number) => {
            // Generate a stable key using _cid if available, or fallback to index
            const stableKey =
              '_cid' in condition && typeof condition._cid === 'string'
                ? condition._cid
                : `condition-${index}`

            return (
              <div key={stableKey} className="relative">
                {isConditionGroup(condition) ? (
                  // Render nested group with verified condition group
                  <ConditionGroupComponent
                    value={condition}
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
                  // Render single condition with verified condition
                  <ConditionBuilder
                    value={
                      isCondition(condition)
                        ? condition
                        : {
                            field: '',
                            operator: 'equals' as ComparisonOperator,
                            value: null,
                            negate: false,
                          }
                    }
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="noShadow"
                size="sm"
                type="button"
                onClick={handleAddCondition}
                disabled={!hasValidEvaluatorBranch()}
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                Add Condition
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Adds a new condition to this group. Each condition checks a
                single attribute like genre, year, or language.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="noShadow"
                size="sm"
                type="button"
                onClick={handleAddGroup}
                disabled={!hasValidEvaluatorBranch()}
              >
                <LayoutList className="h-4 w-4 mr-1" />
                Add Group
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Groups allow you to create more complex logic with conditions
                inside conditions. Each group has its own AND/OR and NOT
                settings.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default ConditionGroupComponent
