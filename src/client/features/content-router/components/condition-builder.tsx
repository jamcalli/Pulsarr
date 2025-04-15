import { useState, useEffect, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import GenreMultiSelect from '@/components/ui/genre-multi-select';
import UserMultiSelect from '@/components/ui/user-multi-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { FieldInfo, OperatorInfo } from '@root/types/router.types';
import type { ICondition, IConditionGroup } from '@/features/content-router/schemas/content-router.schema';
import type { ControllerRenderProps } from 'react-hook-form';

// Interface for evaluator metadata structures
export interface EvaluatorMetadata {
  name: string;
  description: string;
  priority: number;
  supportedFields: FieldInfo[];
  supportedOperators: Record<string, OperatorInfo[]>;
}

interface ConditionType {
  id: string;
  name: string;
  description: string;
}

interface ConditionBuilderProps {
  value: ICondition;
  onChange: (condition: ICondition) => void;
  onRemove?: () => void;
  evaluatorMetadata: EvaluatorMetadata[];
  genres?: string[];
  onGenreDropdownOpen?: () => Promise<void>;
  isLoading?: boolean;
}

// Add this type definition for condition values
type ConditionValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | {
      min?: number;
      max?: number;
    };

const ConditionBuilder = ({
  value,
  onChange,
  onRemove,
  evaluatorMetadata,
  genres = [],
  onGenreDropdownOpen,
  isLoading = false,
}: ConditionBuilderProps) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [selectedEvaluator, setSelectedEvaluator] = useState<EvaluatorMetadata | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [operators, setOperators] = useState<OperatorInfo[]>([]);
  const [valueTypes, setValueTypes] = useState<string[]>([]);
  const [yearMatchType, setYearMatchType] = useState<'exact' | 'range' | 'list'>('exact');
  const inputRef = useRef(null);

  // Update available evaluators and fields when metadata changes
  useEffect(() => {
    if (evaluatorMetadata && evaluatorMetadata.length > 0) {
      // If we already have a field selected, find its evaluator
      if (value.field) {
        // Find which evaluator supports this field
        const evaluator = evaluatorMetadata.find(e => 
          e.supportedFields.some(f => f.name === value.field)
        );
        
        if (evaluator) {
          setSelectedEvaluator(evaluator);
          setFields(evaluator.supportedFields);
          
          // Set operators for this field
          if (evaluator.supportedOperators?.[value.field]) {
            setOperators(evaluator.supportedOperators[value.field]);
            
            // Also set value types if we have an operator
            if (value.operator) {
              const operatorInfo = evaluator.supportedOperators[value.field].find(
                op => op.name === value.operator
              );
              
              if (operatorInfo?.valueTypes) {
                setValueTypes(operatorInfo.valueTypes);
              }
            }
          }

          // Check if this is a year field to determine the match type
          if (value.field === 'year') {
            if (typeof value.value === 'number') {
              setYearMatchType('exact');
            } else if (Array.isArray(value.value)) {
              setYearMatchType('list');
            } else if (typeof value.value === 'object' && value.value !== null) {
              setYearMatchType('range');
            }
          }
        }
      } else if (evaluatorMetadata.length > 0) {
        // If no field is selected, preset the first evaluator but don't select a field yet
        setSelectedEvaluator(evaluatorMetadata[0]);
        setFields(evaluatorMetadata[0].supportedFields);
      }
    }
  }, [evaluatorMetadata, value.field, value.operator, value.value]);

  // Handle evaluator selection
  const handleEvaluatorChange = (evaluatorName: string) => {
    const evaluator = evaluatorMetadata.find(e => e.name === evaluatorName);
    if (evaluator) {
      setSelectedEvaluator(evaluator);
      setFields(evaluator.supportedFields);
      
      // Reset field, operator and value when changing evaluator
      onChange({
        field: '',
        operator: '',
        value: '',
        negate: value.negate || false,
      });
    }
  };

  // Handle field selection
  const handleFieldChange = (fieldName: string) => {
    // Reset operator and value when field changes
    onChange({
      field: fieldName,
      operator: '',
      value: '',
      negate: value.negate || false,
    });
    
    // Update operators for this field
    if (selectedEvaluator?.supportedOperators?.[fieldName]) {
      setOperators(selectedEvaluator.supportedOperators[fieldName]);
    } else {
      setOperators([]);
    }

    // Reset year match type if needed
    if (fieldName === 'year') {
      setYearMatchType('exact');
    }
  };

  // Handle operator selection
  const handleOperatorChange = (operatorName: string) => {
    // Reset value when operator changes
    onChange({
      ...value,
      operator: operatorName,
      value: '',
    });
    
    // Update value types based on selected operator
    if (selectedEvaluator && value.field) {
      const operatorInfo = selectedEvaluator.supportedOperators?.[value.field]?.find(
        op => op.name === operatorName
      );
      
      if (operatorInfo?.valueTypes) {
        setValueTypes(operatorInfo.valueTypes);
      } else {
        setValueTypes([]);
      }
    }
  };

  const handleValueChange = (newValue: ConditionValue) => {
    onChange({
      ...value,
      value: newValue,
    });
  };

  const handleToggleNegate = () => {
    onChange({
      ...value,
      negate: !value.negate,
    });
  };

  const handleYearMatchTypeChange = (type: 'exact' | 'range' | 'list') => {
    setYearMatchType(type);
    
    // Reset the value based on the new match type
    let newValue: ConditionValue = '';
    
    if (type === 'exact') {
      newValue = new Date().getFullYear();
    } else if (type === 'range') {
      newValue = { min: undefined, max: undefined };
    } else if (type === 'list') {
      newValue = [];
    }
    
    onChange({
      ...value,
      value: newValue,
    });
  };

  // Create a properly structured field prop for multi-select components
  const createFormField = (fieldName: string): ControllerRenderProps<any, any> => {
    return {
      name: fieldName,
      value: Array.isArray(value.value) ? value.value : [value.value as string],
      onChange: (newValue) => handleValueChange(Array.isArray(newValue) ? newValue : [newValue]),
      onBlur: () => {}, // Add empty onBlur handler
      ref: (instance: any) => {
        if (inputRef.current !== instance) {
          inputRef.current = instance;
        }
      },
    };
  };

  const renderValueInput = () => {
    if (!value.operator || valueTypes.length === 0) return null;

    // Special handling for genres field
    if (value.field === 'genre' || value.field === 'genres') {
      // Create a properly structured field prop
      const genreField = createFormField('genre');
      
      return (
        <div className="flex-1">
          <GenreMultiSelect 
            field={genreField}
            genres={genres}
            onDropdownOpen={onGenreDropdownOpen}
          />
        </div>
      );
    }

    // Special handling for user field
    if (value.field === 'user' || value.field === 'userId' || value.field === 'userName') {
      // Create a properly structured field prop
      const userField = createFormField('user');
      
      return (
        <div className="flex-1">
          <UserMultiSelect field={userField} />
        </div>
      );
    }

    // Special handling for year field
    if (value.field === 'year') {
      return (
        <div className="flex-1 space-y-4">
          <RadioGroup
            value={yearMatchType}
            onValueChange={(val: 'exact' | 'range' | 'list') => handleYearMatchTypeChange(val)}
            className="flex flex-col space-y-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="exact" id="exact-year" />
              <label
                htmlFor="exact-year"
                className="text-sm text-text font-medium"
              >
                Exact Year
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="range" id="range-year" />
              <label
                htmlFor="range-year"
                className="text-sm text-text font-medium"
              >
                Year Range
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="list" id="list-year" />
              <label
                htmlFor="list-year"
                className="text-sm text-text font-medium"
              >
                Year List
              </label>
            </div>
          </RadioGroup>

          {yearMatchType === 'exact' && (
            <Input
              type="number"
              min="1900"
              max="2100"
              value={value.value !== undefined && typeof value.value === 'number' ? value.value : new Date().getFullYear()}
              onChange={(e) => handleValueChange(Number(e.target.value))}
              placeholder="Enter year (e.g. 2023)"
              className="flex-1"
            />
          )}

          {yearMatchType === 'range' && (
            <div className="flex flex-1 space-x-2">
              <Input
                type="number"
                min="1900"
                max="2100"
                value={
                  typeof value.value === 'object' && value.value !== null && 'min' in value.value && value.value.min !== undefined
                    ? value.value.min
                    : ''
                }
                onChange={(e) => {
                  const min = e.target.value === '' ? undefined : Number(e.target.value);
                  const currentValue = typeof value.value === 'object' && value.value !== null ? value.value : {};
                  handleValueChange({ ...currentValue, min });
                }}
                placeholder="Min Year"
                className="flex-1"
              />
              <span className="self-center">to</span>
              <Input
                type="number"
                min="1900"
                max="2100"
                value={
                  typeof value.value === 'object' && value.value !== null && 'max' in value.value && value.value.max !== undefined
                    ? value.value.max
                    : ''
                }
                onChange={(e) => {
                  const max = e.target.value === '' ? undefined : Number(e.target.value);
                  const currentValue = typeof value.value === 'object' && value.value !== null ? value.value : {};
                  handleValueChange({ ...currentValue, max });
                }}
                placeholder="Max Year"
                className="flex-1"
              />
            </div>
          )}

          {yearMatchType === 'list' && (
            <Input
              type="text"
              value={
                Array.isArray(value.value)
                  ? value.value.join(', ')
                  : (value.value as string) || ''
              }
              onChange={(e) => {
                const arrayValue = e.target.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter((v) => v !== '')
                  .map((v) => Number(v))
                  .filter((v) => !Number.isNaN(v));
                handleValueChange(arrayValue);
              }}
              placeholder="Enter years separated by commas (e.g. 1999, 2000, 2001)"
              className="flex-1"
            />
          )}
        </div>
      );
    }

    // Special handling for language field
    if (value.field === 'language' || value.field === 'originalLanguage') {
      return (
        <Input
          type="text"
          value={
            Array.isArray(value.value)
              ? value.value.join(', ')
              : (value.value as string) || ''
          }
          onChange={(e) => {
            if (value.operator === 'in' || value.operator === 'notIn') {
              const arrayValue = e.target.value
                .split(',')
                .map((v) => v.trim())
                .filter((v) => v !== '');
              handleValueChange(arrayValue);
            } else {
              handleValueChange(e.target.value);
            }
          }}
          placeholder={
            value.operator === 'in' || value.operator === 'notIn'
              ? "Enter languages separated by commas (e.g. English, French, Spanish)"
              : "Enter language (e.g. English)"
          }
          className="flex-1"
        />
      );
    }

    // Handle different value types
    if (valueTypes.includes('number')) {
      return (
        <Input
          type="number"
          value={
            typeof value.value === 'number'
              ? value.value.toString()
              : (value.value as string) || ''
          }
          onChange={(e) => handleValueChange(Number(e.target.value))}
          placeholder="Enter a number"
          className="flex-1"
        />
      );
    }

    if (valueTypes.includes('string')) {
      return (
        <Input
          type="text"
          value={(value.value as string) || ''}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Enter a value"
          className="flex-1"
        />
      );
    }

    if (valueTypes.includes('string[]')) {
      return (
        <Input
          type="text"
          value={
            Array.isArray(value.value)
              ? value.value.join(', ')
              : (value.value as string) || ''
          }
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '');
            handleValueChange(arrayValue);
          }}
          placeholder="Enter values separated by commas"
          className="flex-1"
        />
      );
    }

    if (valueTypes.includes('number[]')) {
      return (
        <Input
          type="text"
          value={
            Array.isArray(value.value)
              ? value.value.join(', ')
              : (value.value as string) || ''
          }
          onChange={(e) => {
            const arrayValue = e.target.value
              .split(',')
              .map((v) => v.trim())
              .map((v) => Number(v))
              .filter((v) => !Number.isNaN(v));
            handleValueChange(arrayValue);
          }}
          placeholder="Enter numbers separated by commas"
          className="flex-1"
        />
      );
    }

    if (valueTypes.includes('object') && value.operator === 'between') {
      // Handle range object for 'between' operator
      const range = (value.value as { min?: number; max?: number }) || {
        min: undefined,
        max: undefined,
      };

      return (
        <div className="flex flex-1 space-x-2">
          <Input
            type="number"
            value={range.min !== undefined ? range.min.toString() : ''}
            onChange={(e) => {
              const min =
                e.target.value === '' ? undefined : Number(e.target.value);
              handleValueChange({ ...range, min });
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
                e.target.value === '' ? undefined : Number(e.target.value);
              handleValueChange({ ...range, max });
            }}
            placeholder="Max"
            className="flex-1"
          />
        </div>
      );
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
    );
  };

  const getFieldDescription = () => {
    if (!value.field || !selectedEvaluator) return null;
    
    const fieldInfo = selectedEvaluator.supportedFields.find(f => f.name === value.field);
    return fieldInfo?.description;
  };

  const getOperatorDescription = () => {
    if (!value.field || !value.operator || !selectedEvaluator) return null;
    
    const operatorInfo = selectedEvaluator.supportedOperators[value.field]?.find(op => op.name === value.operator);
    return operatorInfo?.description;
  };

  if (isLoading) {
    return (
      <Card className="p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-10 w-[30%]" />
          <Skeleton className="h-10 w-[30%]" />
          <Skeleton className="h-10 w-[30%]" />
        </div>
      </Card>
    );
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

      <div className={cn(
        "grid gap-4",
        isMobile ? "grid-cols-1" : "grid-cols-12"
      )}>
        {/* Evaluator selector */}
        <div className={cn(isMobile ? "col-span-1" : "col-span-3")}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <label className="text-sm font-medium">Evaluator</label>
              {selectedEvaluator?.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{selectedEvaluator.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Select 
              value={selectedEvaluator?.name || ''} 
              onValueChange={handleEvaluatorChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select evaluator" />
              </SelectTrigger>
              <SelectContent>
                {evaluatorMetadata.map((evaluator) => (
                  <SelectItem key={evaluator.name} value={evaluator.name}>
                    {evaluator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Field selector */}
        <div className={cn(isMobile ? "col-span-1" : "col-span-3")}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <label className="text-sm font-medium">Field</label>
              {getFieldDescription() && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{getFieldDescription()}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Select 
              value={value.field || ''} 
              onValueChange={handleFieldChange}
              disabled={!selectedEvaluator}
            >
              <SelectTrigger className="w-full">
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
          </div>
        </div>

        {/* Operator selector */}
        <div className={cn(isMobile ? "col-span-1" : "col-span-2")}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <label className="text-sm font-medium">Operator</label>
              {getOperatorDescription() && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{getOperatorDescription()}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Select
              value={value.operator || ''}
              onValueChange={handleOperatorChange}
              disabled={!value.field}
            >
              <SelectTrigger className="w-full">
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
          </div>
        </div>

        {/* Value input */}
        <div className={cn(isMobile ? "col-span-1" : "col-span-3")}>
          <div className="flex flex-col space-y-1">
            <label className="text-sm font-medium">Value</label>
            {value.operator && renderValueInput()}
          </div>
        </div>

        {/* Actions */}
        <div className={cn(isMobile ? "col-span-1" : "col-span-1")} style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '2px' }}>
          {onRemove && (
            <Button
              variant="noShadow"
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
  );
};

export default ConditionBuilder;
