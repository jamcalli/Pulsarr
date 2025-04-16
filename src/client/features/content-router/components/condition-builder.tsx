import { useState, useEffect, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Trash2, HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import ConditionInput from './condition-input'
import { useMediaQuery } from '@/hooks/use-media-query'
import type {
  FieldInfo,
  OperatorInfo,
  EvaluatorMetadata,
} from '@root/schemas/content-router/evaluator-metadata.schema'
import type { Condition } from '@root/schemas/content-router/content-router.schema'

interface ConditionBuilderProps {
  value: Condition
  onChange: (condition: Condition) => void
  onRemove?: () => void
  evaluatorMetadata: EvaluatorMetadata[]
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
  isLoading?: boolean
}

// Type definition for condition values
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

const ConditionBuilder = ({
  value,
  onChange,
  onRemove,
  evaluatorMetadata,
  genres = [],
  onGenreDropdownOpen,
  isLoading = false,
}: ConditionBuilderProps) => {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [fields, setFields] = useState<FieldInfo[]>([])
  const [operators, setOperators] = useState<OperatorInfo[]>([])
  const [valueTypes, setValueTypes] = useState<string[]>([])
  const [fieldDescription, setFieldDescription] = useState('')
  const [operatorDescription, setOperatorDescription] = useState('')

  // Stable reference to current value to avoid stale closures
  const valueRef = useRef(value)
  valueRef.current = value

  // Create stable refs for handler functions
  const handlers = useRef({
    handleFieldChange: (fieldName: string) => {
      // Find which evaluator supports this field
      let fieldEvaluator = null
      let fieldInfo = null

      for (const evaluator of evaluatorMetadata) {
        const foundField = evaluator.supportedFields.find(
          (f) => f.name === fieldName,
        )
        if (foundField) {
          fieldEvaluator = evaluator
          fieldInfo = foundField
          break
        }
      }

      if (fieldEvaluator && fieldInfo) {
        setSelectedEvaluator(fieldEvaluator)
        setFieldDescription(fieldInfo.description || '')

        // Reset operator and value when field changes
        onChange({
          field: fieldName,
          operator: '',
          value: '',
          negate: valueRef.current.negate || false,
        })

        // Update operators for this field
        if (fieldEvaluator.supportedOperators?.[fieldName]) {
          setOperators(fieldEvaluator.supportedOperators[fieldName])
        } else {
          setOperators([])
        }
      }
    },

    handleOperatorChange: (operatorName: string) => {
      const evaluator = selectedEvaluatorRef.current
      if (!evaluator) return

      // Find the operator info
      const operatorInfo = evaluator.supportedOperators?.[
        valueRef.current.field
      ]?.find((op) => op.name === operatorName)

      setOperatorDescription(operatorInfo?.description || '')

      // Initialize an appropriate default value based on operator type
      let defaultValue: ConditionValue = ''

      if (operatorInfo) {
        const valueType = operatorInfo.valueTypes?.[0]

        if (valueType === 'number') {
          defaultValue = 0
        } else if (valueType === 'number[]') {
          defaultValue = []
        } else if (valueType === 'string[]') {
          defaultValue = []
        } else if (valueType === 'object') {
          defaultValue = { min: undefined, max: undefined }
        }

        // Set value types
        setValueTypes(operatorInfo.valueTypes || [])
      }

      // Update with the new operator and clear previous value
      onChange({
        ...valueRef.current,
        operator: operatorName,
        value: defaultValue,
      })
    },

    handleValueChange: (newValue: ConditionValue) => {
      onChange({
        ...valueRef.current,
        value: newValue,
      })
    },

    handleToggleNegate: () => {
      onChange({
        ...valueRef.current,
        negate: !valueRef.current.negate,
      })
    },
  })

  // Filter out the Conditional Router from options - we only want to show actual condition types
  const filteredEvaluators = evaluatorMetadata.filter(
    (e) => e.name !== 'Conditional Router',
  )

  // State to track the selected evaluator (without exposing it directly in the UI)
  const [selectedEvaluator, setSelectedEvaluator] =
    useState<EvaluatorMetadata | null>(null)

  // Keep a ref to the selected evaluator to avoid stale closures
  const selectedEvaluatorRef = useRef<EvaluatorMetadata | null>(null)
  selectedEvaluatorRef.current = selectedEvaluator

  // Update available fields when metadata changes - with optimized dependencies
  useEffect(() => {
    if (!evaluatorMetadata || evaluatorMetadata.length === 0) return

    // Create fields list just once
    const allFields = filteredEvaluators.flatMap((e) => e.supportedFields)
    setFields(allFields)

    // Find evaluator for the current field if one is selected
    if (value.field) {
      let foundEvaluator: EvaluatorMetadata | null = null
      let fieldInfo: FieldInfo | null = null

      // Find which evaluator supports this field
      for (const evaluator of evaluatorMetadata) {
        const foundField = evaluator.supportedFields.find(
          (f) => f.name === value.field,
        )
        if (foundField) {
          foundEvaluator = evaluator
          fieldInfo = foundField
          break
        }
      }

      if (foundEvaluator && fieldInfo) {
        setSelectedEvaluator(foundEvaluator)
        setFieldDescription(fieldInfo.description || '')

        // Set operators for this field
        if (foundEvaluator.supportedOperators?.[value.field]) {
          const fieldOperators = foundEvaluator.supportedOperators[value.field]
          setOperators(fieldOperators)

          // Also set value types and operator description if we have an operator
          if (value.operator) {
            const operatorInfo = fieldOperators.find(
              (op) => op.name === value.operator,
            )
            if (operatorInfo) {
              setValueTypes(operatorInfo.valueTypes || [])
              setOperatorDescription(operatorInfo.description || '')
            }
          }
        }
      } else if (filteredEvaluators.length > 0) {
        // If no evaluator was found that supports this field, use the first one
        setSelectedEvaluator(filteredEvaluators[0])
      }
    } else if (filteredEvaluators.length > 0) {
      // If no field is selected, preset the first non-conditional evaluator
      setSelectedEvaluator(filteredEvaluators[0])
    }
  }, [evaluatorMetadata, value.field, value.operator])

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
            onCheckedChange={handlers.current.handleToggleNegate}
          />
          <span>NOT</span>
        </Label>
      </div>

      <div
        className={cn('grid gap-4', isMobile ? 'grid-cols-1' : 'grid-cols-12')}
      >
        {/* Field selector - now shows all fields from all evaluators */}
        <div className={cn(isMobile ? 'col-span-1' : 'col-span-4')}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <label className="text-sm font-medium">Field</label>
              {fieldDescription && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{fieldDescription}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Select
              value={value.field || ''}
              onValueChange={handlers.current.handleFieldChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.name} value={field.name}>
                    {field.name.charAt(0).toUpperCase() + field.name.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Operator selector */}
        <div className={cn(isMobile ? 'col-span-1' : 'col-span-3')}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <label className="text-sm font-medium">Operator</label>
              {operatorDescription && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{operatorDescription}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Select
              value={value.operator || ''}
              onValueChange={handlers.current.handleOperatorChange}
              disabled={!value.field}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.name} value={op.name}>
                    {op.name.charAt(0).toUpperCase() + op.name.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Value input */}
        <div className={cn(isMobile ? 'col-span-1' : 'col-span-4')}>
          <div className="flex flex-col space-y-1">
            <label className="text-sm font-medium">Value</label>
            {value.operator && value.field && (
              <div className="condition-value-input">
                <ConditionInput
                  field={value.field}
                  operator={value.operator}
                  valueTypes={valueTypes}
                  value={value.value as ConditionValue}
                  onChange={handlers.current.handleValueChange}
                  genres={genres}
                  onGenreDropdownOpen={onGenreDropdownOpen}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          className={cn(isMobile ? 'col-span-1' : 'col-span-1')}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            marginBottom: '2px',
          }}
        >
          {onRemove && (
            <Button
              variant="error"
              size="sm"
              onClick={onRemove}
              className="ml-auto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export default ConditionBuilder
