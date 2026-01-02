import type {
  ComparisonOperator,
  Condition,
  ConditionValue,
} from '@root/schemas/content-router/content-router.schema'
import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema'
import { HelpCircle, Trash2 } from 'lucide-react'
import { useCallback, useContext, useId, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import ConditionInput from '@/features/content-router/components/condition-input'
import { ContentRouterContext } from '@/features/content-router/hooks/useContentRouter'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

/** Format field names for display (e.g., "rtCriticRating" → "RT Critic Rating") */
const FIELD_LABELS: Record<string, string> = {
  imdbRating: 'IMDb Rating',
  rtCriticRating: 'RT Critic Rating',
  rtAudienceRating: 'RT Audience Rating',
  tmdbRating: 'TMDb Rating',
  streamingServices: 'Streaming Services',
  originalLanguage: 'Original Language',
}

function formatFieldName(name: string): string {
  if (FIELD_LABELS[name]) return FIELD_LABELS[name]
  // Default: capitalize first letter and add spaces before capitals
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

interface ConditionBuilderProps {
  value: Condition
  onChange: (condition: Condition) => void
  onRemove?: () => void
  evaluatorMetadata: EvaluatorMetadata[]
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
  isLoading?: boolean
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
  const fieldSelectId = useId()
  const operatorSelectId = useId()
  const fallbackId = useId()
  const inputId = `condition-input-${value._cid || fallbackId}`

  const routerContext = useContext(ContentRouterContext)
  const contentType = routerContext?.contentType || 'both'

  // Filter evaluators by content type compatibility
  const compatibleEvaluators = useMemo(() => {
    return evaluatorMetadata
      .filter((e) => e.name !== 'Conditional Router')
      .filter(
        (e) =>
          !e.contentType ||
          e.contentType === 'both' ||
          e.contentType === contentType,
      )
  }, [evaluatorMetadata, contentType])

  // Get all available fields sorted alphabetically, deduped by name
  const fields = useMemo(() => {
    if (!compatibleEvaluators.length) return []
    const uniqueFields = new Map()
    for (const field of compatibleEvaluators.flatMap(
      (e) => e.supportedFields,
    )) {
      uniqueFields.set(field.name, field)
    }
    return Array.from(uniqueFields.values()).sort((a, b) =>
      formatFieldName(a.name).localeCompare(formatFieldName(b.name)),
    )
  }, [compatibleEvaluators])

  // Find evaluator and field metadata for selected field
  const currentFieldData = useMemo(() => {
    if (!value.field || !compatibleEvaluators.length) {
      return { evaluator: null, fieldInfo: null }
    }

    for (const evaluator of compatibleEvaluators) {
      const fieldInfo = evaluator.supportedFields.find(
        (f) => f.name === value.field,
      )
      if (fieldInfo) {
        return { evaluator, fieldInfo }
      }
    }

    return { evaluator: null, fieldInfo: null }
  }, [value.field, compatibleEvaluators])

  // Get supported operators for selected field
  const operators = useMemo(() => {
    if (!currentFieldData.evaluator || !value.field) return []
    return currentFieldData.evaluator.supportedOperators?.[value.field] || []
  }, [currentFieldData.evaluator, value.field])

  // Get metadata for selected operator
  const currentOperatorInfo = useMemo(() => {
    if (!value.operator) return null
    return operators.find((op) => op.name === value.operator) || null
  }, [value.operator, operators])

  const fieldDescription = currentFieldData.fieldInfo?.description || ''
  const operatorDescription = currentOperatorInfo?.description || ''
  const valueTypes = currentOperatorInfo?.valueTypes || []

  // Determine if the current field/operator combo renders a composite input
  // (multiple controls without a single focusable element with inputId)
  const isCompositeInput = useMemo(() => {
    if (!value.field || !value.operator) return false

    // Always composite fields
    if (value.field === 'streamingServices') return true
    if (value.field === 'imdbRating') return true

    // Range inputs (two inputs)
    if (value.operator === 'between') return true

    // Multi-select inputs
    if (value.operator === 'in' || value.operator === 'notIn') {
      if (value.field === 'certification') return true
      if (value.field === 'genre' || value.field === 'genres') return true
      if (
        value.field === 'user' ||
        value.field === 'userId' ||
        value.field === 'userName'
      )
        return true
    }

    // Genre/user equals with array value uses multi-select
    if (value.operator === 'equals') {
      const isArrayValue = Array.isArray(value.value)
      if (isArrayValue && (value.field === 'genre' || value.field === 'genres'))
        return true
      if (
        isArrayValue &&
        (value.field === 'user' ||
          value.field === 'userId' ||
          value.field === 'userName')
      )
        return true
    }

    return false
  }, [value.field, value.operator, value.value])

  const handleFieldChange = useCallback(
    (fieldName: string) => {
      if (!fieldName) {
        onChange({
          ...value,
          field: '',
          operator: 'equals',
          value: null,
        })
        return
      }

      // Find evaluator for this field
      const evaluator = compatibleEvaluators.find((e) =>
        e.supportedFields.some((f) => f.name === fieldName),
      )

      if (!evaluator) return

      // Get first operator for this field
      const firstOperator =
        evaluator.supportedOperators?.[fieldName]?.[0]?.name || 'equals'

      onChange({
        ...value,
        field: fieldName,
        operator: firstOperator as ComparisonOperator,
        value: null,
      })
    },
    [onChange, value, compatibleEvaluators],
  )

  const handleOperatorChange = useCallback(
    (operatorName: string) => {
      if (!operatorName) {
        onChange({
          ...value,
          operator: 'equals',
          value: null,
        })
        return
      }

      // Initialize appropriate default value based on operator type
      const operatorInfo = operators.find((op) => op.name === operatorName)
      let defaultValue: ConditionValue = null

      if (operatorInfo) {
        const valueType = operatorInfo.valueTypes?.[0]
        if (valueType === 'number') defaultValue = 0
        else if (valueType === 'number[]') defaultValue = []
        else if (valueType === 'string[]') defaultValue = []
        else if (valueType === 'object')
          defaultValue = { min: undefined, max: undefined }
      }

      onChange({
        ...value,
        operator: operatorName as ComparisonOperator,
        value: defaultValue,
      })
    },
    [onChange, value, operators],
  )

  const handleValueChange = useCallback(
    (newValue: ConditionValue) => {
      onChange({
        ...value,
        value: newValue,
      })
    },
    [onChange, value],
  )

  const handleToggleNegate = useCallback(() => {
    onChange({
      ...value,
      negate: !value.negate,
    })
  }, [onChange, value])

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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <Label className="flex items-center space-x-2 cursor-pointer">
                  <Switch
                    checked={value.negate || false}
                    onCheckedChange={handleToggleNegate}
                    variant="danger"
                  />
                  <span>NOT</span>
                </Label>
                <HelpCircle className="h-4 w-4 ml-1 text-muted-foreground cursor-help" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Inverts just this specific condition. For example, "Genre equals
                Action" becomes "Genre does not equal Action".
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div
        className={cn('grid gap-4', isMobile ? 'grid-cols-1' : 'grid-cols-12')}
      >
        {/* Field selector */}
        <div className={cn(isMobile ? 'col-span-1' : 'col-span-4')}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <Label htmlFor={fieldSelectId} className="text-sm font-medium">
                Field
              </Label>
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
            <Select value={value.field || ''} onValueChange={handleFieldChange}>
              <SelectTrigger id={fieldSelectId} className="w-full">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.name} value={field.name}>
                    {formatFieldName(field.name)}
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
              <Label htmlFor={operatorSelectId} className="text-sm font-medium">
                Operator
              </Label>
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
              key={value.field}
              value={value.operator || ''}
              onValueChange={handleOperatorChange}
              disabled={!value.field}
            >
              <SelectTrigger id={operatorSelectId} className="w-full">
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
            <div className="flex items-center space-x-1">
              <label
                htmlFor={isCompositeInput ? undefined : inputId}
                className="text-sm font-medium"
              >
                Value
              </label>
              {value.field === 'certification' &&
                (value.operator === 'in' || value.operator === 'notIn') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Certifications are region-agnostic. Selecting a value
                          (e.g., "PG") will match content with that rating
                          across all regions.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
            </div>
            {value.operator && value.field && (
              <div className="condition-value-input">
                <ConditionInput
                  field={value.field}
                  operator={value.operator}
                  valueTypes={valueTypes}
                  value={value.value as ConditionValue}
                  onChange={handleValueChange}
                  genres={genres}
                  onGenreDropdownOpen={onGenreDropdownOpen}
                  inputId={inputId}
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
              type="button"
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
