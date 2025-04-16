// src/client/features/content-router/components/condition-builder.tsx
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
import ConditionInput from './condition-input';
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

interface ConditionBuilderProps {
  value: ICondition;
  onChange: (condition: ICondition) => void;
  onRemove?: () => void;
  evaluatorMetadata: EvaluatorMetadata[];
  genres?: string[];
  onGenreDropdownOpen?: () => Promise<void>;
  isLoading?: boolean;
}

// Type definition for condition values
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
  const [evaluatorDescription, setEvaluatorDescription] = useState('');
  const [fieldDescription, setFieldDescription] = useState('');
  const [operatorDescription, setOperatorDescription] = useState('');

  // Update available evaluators and fields when metadata changes
  useEffect(() => {
    if (evaluatorMetadata && evaluatorMetadata.length > 0) {
      // If we already have a field selected, find its evaluator
      if (value.field) {
        let foundEvaluator = null;
        
        // Find which evaluator supports this field
        for (const evaluator of evaluatorMetadata) {
          const fieldInfo = evaluator.supportedFields.find(f => f.name === value.field);
          if (fieldInfo) {
            foundEvaluator = evaluator;
            setSelectedEvaluator(evaluator);
            setFields(evaluator.supportedFields);
            setEvaluatorDescription(evaluator.description || '');
            setFieldDescription(fieldInfo.description || '');
            
            // Set operators for this field
            if (evaluator.supportedOperators?.[value.field]) {
              const fieldOperators = evaluator.supportedOperators[value.field];
              setOperators(fieldOperators);
              
              // Also set value types and operator description if we have an operator
              if (value.operator) {
                const operatorInfo = fieldOperators.find(op => op.name === value.operator);
                if (operatorInfo) {
                  setValueTypes(operatorInfo.valueTypes || []);
                  setOperatorDescription(operatorInfo.description || '');
                }
              }
            }
            break;
          }
        }
        
        // If no evaluator was found that supports this field, use the first one
        if (!foundEvaluator && evaluatorMetadata.length > 0) {
          setSelectedEvaluator(evaluatorMetadata[0]);
          setFields(evaluatorMetadata[0].supportedFields);
          setEvaluatorDescription(evaluatorMetadata[0].description || '');
        }
      } else if (evaluatorMetadata.length > 0) {
        // If no field is selected, preset the first evaluator but don't select a field yet
        setSelectedEvaluator(evaluatorMetadata[0]);
        setFields(evaluatorMetadata[0].supportedFields);
        setEvaluatorDescription(evaluatorMetadata[0].description || '');
      }
    }
  }, [evaluatorMetadata, value.field, value.operator]);

  // Handle evaluator selection
  const handleEvaluatorChange = (evaluatorName: string) => {
    const evaluator = evaluatorMetadata.find(e => e.name === evaluatorName);
    if (evaluator) {
      setSelectedEvaluator(evaluator);
      setFields(evaluator.supportedFields);
      setEvaluatorDescription(evaluator.description || '');
      
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
    const fieldInfo = selectedEvaluator?.supportedFields.find(f => f.name === fieldName);
    setFieldDescription(fieldInfo?.description || '');
    
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
  };

  // Handle operator selection
  const handleOperatorChange = (operatorName: string) => {
    // Find the operator info
    const operatorInfo = selectedEvaluator?.supportedOperators?.[value.field]?.find(
      op => op.name === operatorName
    );
    
    setOperatorDescription(operatorInfo?.description || '');
    
    // Initialize an appropriate default value based on operator type
    let defaultValue: ConditionValue = '';
    
    if (operatorInfo) {
      const valueType = operatorInfo.valueTypes?.[0];
      
      if (valueType === 'number') {
        defaultValue = 0;
      } else if (valueType === 'number[]') {
        defaultValue = [];
      } else if (valueType === 'string[]') {
        defaultValue = [];
      } else if (valueType === 'object') {
        defaultValue = { min: undefined, max: undefined };
      }
      
      // Set value types
      setValueTypes(operatorInfo.valueTypes || []);
    }
    
    // Update with the new operator and clear previous value
    onChange({
      ...value,
      operator: operatorName,
      value: defaultValue,
    });
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
              {evaluatorDescription && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{evaluatorDescription}</p>
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
              {fieldDescription && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
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
              {operatorDescription && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 opacity-70" />
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
            {value.operator && (
              <ConditionInput
                field={value.field}
                operator={value.operator}
                valueTypes={valueTypes}
                value={value.value as ConditionValue}
                onChange={handleValueChange}
                genres={genres}
                onGenreDropdownOpen={onGenreDropdownOpen}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div 
          className={cn(isMobile ? "col-span-1" : "col-span-1")} 
          style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '2px' }}
        >
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