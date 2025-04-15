import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { FieldInfo, OperatorInfo } from '@root/types/router.types'
import type { ICondition } from '@/features/content-router/schemas/content-router.schema'

// Interface for evaluator metadata structures
export interface EvaluatorMetadata {
  name: string
  description: string
  priority: number
  supportedFields: FieldInfo[]
  supportedOperators: Record<string, OperatorInfo[]>
}

interface ConditionBuilderProps {
  value: ICondition
  onChange: (condition: ICondition) => void
  onRemove?: () => void
  evaluatorMetadata: EvaluatorMetadata[]
  isLoading?: boolean
}

// Add this type definition near the top with other interfaces
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

// Helper to get all supported fields from metadata
const getAllFields = (evaluatorMetadata: EvaluatorMetadata[]): FieldInfo[] => {
  const fields: FieldInfo[] = []
  for (const evaluator of evaluatorMetadata) {
    if (evaluator.supportedFields) {
      for (const field of evaluator.supportedFields) {
        if (!fields.some((f) => f.name === field.name)) {
          fields.push(field)
        }
      }
    }
  }
  return fields
}

// Get all operators supported for a specific field
const getOperatorsForField = (
  evaluatorMetadata: EvaluatorMetadata[],
  fieldName: string,
): OperatorInfo[] => {
  let operators: OperatorInfo[] = []
  for (const evaluator of evaluatorMetadata) {
    if (evaluator.supportedOperators?.[fieldName]) {
      operators = [...operators, ...evaluator.supportedOperators[fieldName]]
    }
  }
  return operators
}

// Get value types for a field/operator combination
const getValueTypes = (
  evaluatorMetadata: EvaluatorMetadata[],
  fieldName: string,
  operatorName: string,
): string[] => {
  let valueTypes: string[] = []
  for (const evaluator of evaluatorMetadata) {
    if (evaluator.supportedOperators?.[fieldName]) {
      const operator = evaluator.supportedOperators[fieldName].find(
        (op) => op.name === operatorName,
      )
      if (operator?.valueTypes) {
        valueTypes = operator.valueTypes
      }
    }
  }
  return valueTypes
}

const ConditionBuilder = ({
  value,
  onChange,
  onRemove,
  evaluatorMetadata,
  isLoading = false,
}: ConditionBuilderProps) => {
  const [fields, setFields] = useState<FieldInfo[]>([])
  const [operators, setOperators] = useState<OperatorInfo[]>([])
  const [valueTypes, setValueTypes] = useState<string[]>([])

  // Update available fields when metadata changes
  useEffect(() => {
    if (evaluatorMetadata && evaluatorMetadata.length > 0) {
      setFields(getAllFields(evaluatorMetadata))
    }
  }, [evaluatorMetadata])

  // Update available operators when field changes
  useEffect(() => {
    if (evaluatorMetadata && evaluatorMetadata.length > 0 && value.field) {
      const ops = getOperatorsForField(evaluatorMetadata, value.field)
      setOperators(ops)

      // Set default operator if needed
      if (ops.length > 0 && !value.operator) {
        onChange({
          ...value,
          operator: ops[0].name,
        })
      }
    }
  }, [evaluatorMetadata, value.field, onChange, value])

  // Update available value types when operator changes
  useEffect(() => {
    if (
      evaluatorMetadata &&
      evaluatorMetadata.length > 0 &&
      value.field &&
      value.operator
    ) {
      const types = getValueTypes(
        evaluatorMetadata,
        value.field,
        value.operator,
      )
      setValueTypes(types)
    }
  }, [evaluatorMetadata, value.field, value.operator])

  const handleFieldChange = (fieldName: string) => {
    // Reset operator and value when field changes
    onChange({
      field: fieldName,
      operator: '',
      value: '',
      negate: value.negate || false,
    })
  }

  const handleOperatorChange = (operatorName: string) => {
    // Reset value when operator changes
    onChange({
      ...value,
      operator: operatorName,
      value: '',
    })
  }

  const handleValueChange = (newValue: ConditionValue) => {
    onChange({
      ...value,
      value: newValue,
    })
  }

  const handleToggleNegate = () => {
    onChange({
      ...value,
      negate: !value.negate,
    })
  }

  const renderValueInput = () => {
    if (!value.operator || valueTypes.length === 0) return null

    // Handle different value types
    if (valueTypes.includes('number')) {
      return (
        <Input
          type="number"
          value={
            typeof value.value === 'number'
              ? value.value.toString()
              : (value.value as string)
          }
          onChange={(e) => handleValueChange(Number(e.target.value))}
          placeholder="Enter a number"
          className="flex-1"
        />
      )
    }

    if (valueTypes.includes('string')) {
      return (
        <Input
          type="text"
          value={value.value as string}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Enter a value"
          className="flex-1"
        />
      )
    }

    if (valueTypes.includes('string[]')) {
      return (
        <Input
          type="text"
          value={
            Array.isArray(value.value)
              ? value.value.join(', ')
              : (value.value as string)
          }
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '')
            handleValueChange(arrayValue)
          }}
          placeholder="Enter values separated by commas"
          className="flex-1"
        />
      )
    }

    if (valueTypes.includes('number[]')) {
      return (
        <Input
          type="text"
          value={
            Array.isArray(value.value)
              ? value.value.join(', ')
              : (value.value as string)
          }
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .map((v) => Number(v))
              .filter((v) => !Number.isNaN(v))
            handleValueChange(arrayValue)
          }}
          placeholder="Enter numbers separated by commas"
          className="flex-1"
        />
      )
    }

    if (valueTypes.includes('object') && value.operator === 'between') {
      // Handle range object for 'between' operator
      const range = (value.value as { min?: number; max?: number }) || {
        min: undefined,
        max: undefined,
      }

      return (
        <div className="flex flex-1 space-x-2">
          <Input
            type="number"
            value={range.min !== undefined ? range.min.toString() : ''}
            onChange={(e) => {
              const min =
                e.target.value === '' ? undefined : Number(e.target.value)
              handleValueChange({ ...range, min })
            }}
            placeholder="Min"
            className="flex-1"
          />
          <span className="self-center">to</span>
          <Input
            type="number"
            value={range.max !== undefined ? range.max.toString() : ''}
            onChange={(e) => {
              const max =
                e.target.value === '' ? undefined : Number(e.target.value)
              handleValueChange({ ...range, max })
            }}
            placeholder="Max"
            className="flex-1"
          />
        </div>
      )
    }

    // Fallback
    return (
      <Input
        type="text"
        value={typeof value.value === 'string' ? value.value : ''}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Enter a value"
        className="flex-1"
      />
    )
  }

  if (isLoading) {
    return (
      <Card className="p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-10 w-[30%]" />
          <Skeleton className="h-10 w-[30%]" />
          <Skeleton className="h-10 w-[30%]" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center space-x-2 mb-2">
        <Label className="flex items-center space-x-2 cursor-pointer">
          <Switch
            checked={value.negate || false}
            onCheckedChange={handleToggleNegate}
          />
          <span>NOT</span>
        </Label>
      </div>

      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
        {/* Field selector */}
        <Select value={value.field || ''} onValueChange={handleFieldChange}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field.name} value={field.name}>
                {field.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operator selector - only visible when field is selected */}
        {value.field && (
          <Select
            value={value.operator || ''}
            onValueChange={handleOperatorChange}
          >
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op.name} value={op.name}>
                  {op.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Value input - only visible when operator is selected */}
        {value.operator && renderValueInput()}

        {/* Remove button */}
        {onRemove && (
          <Button
            variant="noShadow"
            size="icon"
            onClick={onRemove}
            className="self-start"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  )
}

export default ConditionBuilder
