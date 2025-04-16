// src/client/features/content-router/components/condition-group.tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, LayoutList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import ConditionBuilder, { EvaluatorMetadata } from './condition-builder';
import type {
  ICondition,
  IConditionGroup,
} from '@/features/content-router/schemas/content-router.schema';

interface ConditionGroupComponentProps {
  value: IConditionGroup;
  onChange: (value: IConditionGroup) => void;
  onRemove?: () => void;
  evaluatorMetadata: EvaluatorMetadata[];
  genres?: string[];
  onGenreDropdownOpen?: () => Promise<void>;
  isLoading?: boolean;
  level?: number;
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
  
  // Create a properly structured empty condition with defaults from evaluator metadata
  const createEmptyCondition = useCallback((): ICondition => {
    if (!evaluatorMetadata || evaluatorMetadata.length === 0) {
      return {
        field: '',
        operator: '',
        value: '',
        negate: false,
      };
    }
    
    // Use first evaluator to create an appropriate condition
    const firstEvaluator = evaluatorMetadata[0];
    const firstField = firstEvaluator.supportedFields[0]?.name || '';
    
    // If no field is available, return generic condition
    if (!firstField) {
      return {
        field: '',
        operator: '',
        value: '',
        negate: false,
      };
    }
    
    // Get the first operator for the first field
    const operators = firstEvaluator.supportedOperators?.[firstField] || [];
    const firstOperator = operators[0]?.name || '';
    
    // Determine appropriate initial value based on value type
    let initialValue: any = '';
    if (operators[0]?.valueTypes) {
      const valueType = operators[0].valueTypes[0];
      if (valueType === 'number') initialValue = 0;
      else if (valueType === 'string[]' || valueType === 'number[]') initialValue = [];
      else if (valueType === 'object') initialValue = { min: undefined, max: undefined };
    }
    
    return {
      field: firstField,
      operator: firstOperator,
      value: initialValue,
      negate: false,
    };
  }, [evaluatorMetadata]);

  // Create an empty group with one empty condition
  const createEmptyGroup = useCallback((): IConditionGroup => {
    return {
      operator: 'AND',
      conditions: [createEmptyCondition()],
      negate: false,
    };
  }, [createEmptyCondition]);

  // Initialize conditions with proper fields when metadata is loaded
  useEffect(() => {
    if (evaluatorMetadata.length > 0) {
      // If there are no conditions, create an initial one
      if (!value.conditions || value.conditions.length === 0) {
        onChange({
          ...value,
          conditions: [createEmptyCondition()]
        });
      }
    }
  }, [evaluatorMetadata, onChange, value, createEmptyCondition]);

  // Handle toggling the negate flag
  const handleToggleNegate = () => {
    onChange({
      ...value,
      negate: !value.negate,
    });
  };

  // Handle changing the logical operator (AND/OR)
  const handleOperatorChange = (newOperator: 'AND' | 'OR') => {
    onChange({
      ...value,
      operator: newOperator,
    });
  };

  // Add a new empty condition to the group
  const handleAddCondition = () => {
    if (evaluatorMetadata.length === 0) {
      console.warn("Cannot add condition: No evaluator metadata available");
      return;
    }

    const newCondition = createEmptyCondition();
    
    // Ensure value.conditions is an array before spreading
    const currentConditions = Array.isArray(value.conditions) ? value.conditions : [];
    
    onChange({
      ...value,
      conditions: [...currentConditions, newCondition],
    });
  };

  // Add a new nested condition group to the group
  const handleAddGroup = () => {
    const newGroup = createEmptyGroup();
    
    // Ensure value.conditions is an array before spreading
    const currentConditions = Array.isArray(value.conditions) ? value.conditions : [];
    
    onChange({
      ...value,
      conditions: [...currentConditions, newGroup],
    });
  };

  // Update a specific condition in the group
  const handleUpdateCondition = (
    index: number,
    updatedCondition: ICondition | IConditionGroup,
  ) => {
    // Ensure value.conditions is an array before modifying
    if (!Array.isArray(value.conditions)) {
      const newConditions = [updatedCondition];
      onChange({
        ...value,
        conditions: newConditions,
      });
      return;
    }
    
    const newConditions = [...value.conditions];
    newConditions[index] = updatedCondition;
    onChange({
      ...value,
      conditions: newConditions,
    });
  };

  // Remove a condition from the group
  const handleRemoveCondition = (index: number) => {
    // Ensure value.conditions is an array before filtering
    if (!Array.isArray(value.conditions)) {
      onChange({
        ...value,
        conditions: [createEmptyCondition()],
      });
      return;
    }
    
    const newConditions = value.conditions.filter((_, i) => i !== index);
    onChange({
      ...value,
      conditions: newConditions.length > 0 ? newConditions : [createEmptyCondition()],
    });
  };

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
    );
  }

  // Generate border color based on nesting level
  const getLevelColor = () => {
    const colors = [
      'border-primary',
      'border-secondary',
      'border-accent',
      'border-fun',
      'border-green',
    ];
    return colors[level % colors.length];
  };

  // Ensure value.conditions is always an array
  const conditions = Array.isArray(value.conditions) ? value.conditions : [];

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
        {conditions.map((condition, index) => {
          // Create a unique key for the condition
          const conditionKey = `condition-${index}-${Date.now()}`;
          
          // Check if this is a condition group or a single condition
          const isGroup = condition && 
                          typeof condition === 'object' && 
                          'operator' in condition &&
                          'conditions' in condition;
          
          return (
            <div key={conditionKey} className="relative">
              {isGroup ? (
                // Render nested group
                <ConditionGroupComponent
                  value={condition as IConditionGroup}
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
                  value={condition as ICondition}
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
          );
        })}
      </div>

      <div className="flex space-x-2 mt-4">
        <Button
          variant="noShadow"
          size="sm"
          onClick={handleAddCondition}
          disabled={evaluatorMetadata.length === 0}
        >
          <PlusCircle className="h-4 w-4 mr-1" />
          Add Condition
        </Button>
        <Button
          variant="noShadow"
          size="sm"
          onClick={handleAddGroup}
          disabled={evaluatorMetadata.length === 0}
        >
          <LayoutList className="h-4 w-4 mr-1" />
          Add Group
        </Button>
      </div>
    </div>
  );
};

export default ConditionGroupComponent;