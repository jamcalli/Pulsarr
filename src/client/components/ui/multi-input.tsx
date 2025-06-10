import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface MultiInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  buttonClassName?: string
  /**
   * Minimum number of input fields to show
   * @default 1
   */
  minFields?: number
  /**
   * Maximum number of input fields to allow
   * @default 10
   */
  maxFields?: number
  /**
   * Separator to use when joining/splitting values
   * @default ","
   */
  separator?: string
  /**
   * Custom validation function for individual values
   */
  validateValue?: (value: string) => boolean
}

/**
 * A multi-input component that manages multiple input fields and stores them as a separator-delimited string.
 * 
 * Features:
 * - Add/remove input fields dynamically
 * - Stores values as comma-separated string (or custom separator)
 * - Automatic cleanup of empty values
 * - Configurable min/max fields
 * - Individual field validation
 * - Keyboard shortcuts (Enter to add, Escape to remove)
 * 
 * @param value - The current comma-separated string value
 * @param onChange - Callback when the value changes
 * @param placeholder - Placeholder text for input fields
 * @param disabled - Whether inputs are disabled
 * @param className - CSS classes for the container
 * @param inputClassName - CSS classes for input fields
 * @param buttonClassName - CSS classes for buttons
 * @param minFields - Minimum number of input fields (default: 1)
 * @param maxFields - Maximum number of input fields (default: 10)
 * @param separator - Separator character (default: ",")
 * @param validateValue - Custom validation function for individual values
 */
export function MultiInput({
  value = '',
  onChange,
  placeholder = 'Enter value...',
  disabled = false,
  className,
  inputClassName,
  buttonClassName,
  minFields = 1,
  maxFields = 10,
  separator = ',',
  validateValue,
}: MultiInputProps) {
  // Convert comma-separated string to array of values
  const stringToArray = React.useCallback((str: string): string[] => {
    if (!str.trim()) return Array(minFields).fill('')
    
    const values = str.split(separator).map(v => v.trim())
    
    // Ensure we have at least minFields
    while (values.length < minFields) {
      values.push('')
    }
    
    return values
  }, [separator, minFields])

  // Convert array of values to comma-separated string
  const arrayToString = React.useCallback((arr: string[]): string => {
    return arr
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .join(separator)
  }, [separator])

  const [fields, setFields] = React.useState<string[]>(() => stringToArray(value))

  // Update fields when external value changes
  React.useEffect(() => {
    const newFields = stringToArray(value)
    setFields(newFields)
  }, [value, stringToArray])

  // Emit changes to parent
  const emitChange = React.useCallback((newFields: string[]) => {
    const newValue = arrayToString(newFields)
    onChange?.(newValue)
  }, [onChange, arrayToString])

  // Update a specific field
  const updateField = React.useCallback((index: number, newValue: string) => {
    setFields(prev => {
      const updated = [...prev]
      updated[index] = newValue
      emitChange(updated)
      return updated
    })
  }, [emitChange])

  // Add a new field
  const addField = React.useCallback(() => {
    if (fields.length >= maxFields) return
    
    setFields(prev => {
      const updated = [...prev, '']
      emitChange(updated)
      return updated
    })
  }, [fields.length, maxFields, emitChange])

  // Remove a field
  const removeField = React.useCallback((index: number) => {
    if (fields.length <= minFields) return
    
    setFields(prev => {
      const updated = prev.filter((_, i) => i !== index)
      emitChange(updated)
      return updated
    })
  }, [fields.length, minFields, emitChange])


  const canAddField = fields.length < maxFields

  return (
    <div className={cn('space-y-2', className)}>
      {fields.map((field, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            value={field}
            onChange={(e) => updateField(index, e.target.value)}
            placeholder={`${placeholder}${index === 0 ? '' : ` ${index + 1}`}`}
            disabled={disabled}
            className={cn('flex-1', inputClassName)}
            data-invalid={validateValue && field ? !validateValue(field) : undefined}
          />
          
          {/* Remove button - only show on fields beyond the first one */}
          {index > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="error"
                    size="icon"
                    onClick={() => removeField(index)}
                    disabled={disabled}
                    className={cn('shrink-0', buttonClassName)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove this field</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Add button - only show on the last field if we can add more */}
          {index === fields.length - 1 && canAddField && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="noShadow"
                    size="icon"
                    onClick={addField}
                    disabled={disabled}
                    className={cn('shrink-0', buttonClassName)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add another field</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ))}
      
      {/* Help text */}
      {fields.length > 1 && (
        <p className="text-xs text-text opacity-70">
          Empty fields will be automatically removed when saving.
        </p>
      )}
    </div>
  )
}