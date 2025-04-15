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
  import type { EvaluatorMetadata } from './condition-builder'
  import type {
    ICondition,
    IConditionGroup,
  } from '@/features/content-router/schemas/content-router.schema'
  
  interface ConditionGroupComponentProps {
    value: IConditionGroup
    onChange: (value: IConditionGroup) => void
    onRemove?: () => void
    evaluatorMetadata: EvaluatorMetadata[]
    isLoading?: boolean
    level?: number
  }
  
  const ConditionGroupComponent = ({
    value,
    onChange,
    onRemove,
    evaluatorMetadata,
    isLoading = false,
    level = 0,
  }: ConditionGroupComponentProps) => {
    // Helper to get all supported fields from metadata
    const getAllFields = (evaluatorMetadata: EvaluatorMetadata[]): string[] => {
      const fieldNames: string[] = []
      for (const evaluator of evaluatorMetadata) {
        if (evaluator.supportedFields) {
          for (const field of evaluator.supportedFields) {
            if (!fieldNames.includes(field.name)) {
              fieldNames.push(field.name)
            }
          }
        }
      }
      return fieldNames
    }
  
    // Create an empty condition with the first available field from metadata
    const createEmptyCondition = (): ICondition => {
      // Get available fields
      const availableFields = getAllFields(evaluatorMetadata)
      
      // Use first available field if exists, otherwise empty string
      const initialField = availableFields.length > 0 ? availableFields[0] : ''
      
      return {
        field: initialField,
        operator: '',
        value: '',
        negate: false,
      }
    }
  
    // Create an empty group with one empty condition
    const createEmptyGroup = (): IConditionGroup => ({
      operator: 'AND',
      conditions: [createEmptyCondition()],
      negate: false,
    })
  
    // Handle toggling the negate flag
    const handleToggleNegate = () => {
      onChange({
        ...value,
        negate: !value.negate,
      })
    }
  
    // Handle changing the logical operator (AND/OR)
    const handleOperatorChange = (newOperator: 'AND' | 'OR') => {
      onChange({
        ...value,
        operator: newOperator,
      })
    }
  
    // Add a new empty condition to the group
    const handleAddCondition = () => {
      const newCondition = createEmptyCondition()
      onChange({
        ...value,
        conditions: [...value.conditions, newCondition],
      })
    }
  
    // Add a new nested condition group to the group
    const handleAddGroup = () => {
      onChange({
        ...value,
        conditions: [...value.conditions, createEmptyGroup()],
      })
    }
  
    // Update a specific condition in the group
    const handleUpdateCondition = (
      index: number,
      updatedCondition: ICondition | IConditionGroup,
    ) => {
      const newConditions = [...value.conditions]
      newConditions[index] = updatedCondition
      onChange({
        ...value,
        conditions: newConditions,
      })
    }
  
    // Remove a condition from the group
    const handleRemoveCondition = (index: number) => {
      const newConditions = value.conditions.filter((_, i) => i !== index)
      onChange({
        ...value,
        conditions:
          newConditions.length > 0 ? newConditions : [createEmptyCondition()],
      })
    }
  
    if (isLoading) {
      return (
        <div className="space-y-4">
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
          {value?.conditions?.map((condition, index) => {
            // Create a unique key based on condition properties plus index
            const conditionKey = `condition-${index}-${Date.now()}`;
            
            return (
              <div key={conditionKey} className="relative">
                {'operator' in condition ? (
                  // Render nested group
                  <ConditionGroupComponent
                    value={condition as IConditionGroup}
                    onChange={(updatedGroup) =>
                      handleUpdateCondition(index, updatedGroup)
                    }
                    onRemove={() => handleRemoveCondition(index)}
                    evaluatorMetadata={evaluatorMetadata}
                    isLoading={isLoading}
                    level={level + 1}
                  />
                ) : (
                  // Render single condition
                  <ConditionBuilder
                    value={condition as ICondition}
                    onChange={(updatedCondition) =>
                      handleUpdateCondition(index, updatedCondition)
                    }
                    onRemove={() => handleRemoveCondition(index)}
                    evaluatorMetadata={evaluatorMetadata}
                    isLoading={isLoading}
                  />
                )}
              </div>
            )
          }) || null}
        </div>
  
        <div className="flex space-x-2 mt-4">
          <Button variant="noShadow" size="sm" onClick={handleAddCondition}>
            <PlusCircle className="h-4 w-4 mr-1" />
            Add Condition
          </Button>
          <Button variant="noShadow" size="sm" onClick={handleAddGroup}>
            <LayoutList className="h-4 w-4 mr-1" />
            Add Group
          </Button>
        </div>
      </div>
    )
  }
  
  export default ConditionGroupComponent