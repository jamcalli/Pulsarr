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
import ConditionBuilder from './condition-builder';
import type { EvaluatorMetadata } from './condition-builder';
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
  // Helper to get all supported fields from metadata
  const getAllFields = (evaluatorMetadata: EvaluatorMetadata[]): string[] => {
    const fieldNames: string[] = [];
    for (const evaluator of evaluatorMetadata) {
      if (evaluator.supportedFields) {
        for (const field of evaluator.supportedFields) {
          if (!fieldNames.includes(field.name)) {
            fieldNames.push(field.name);
          }
        }
      }
    }
    return fieldNames;
  };

  // Create an empty condition with the first available evaluator, field, and operator
  const createEmptyCondition = (): ICondition => {
    console.log("Creating empty condition with evaluatorMetadata:", 
      evaluatorMetadata.map(e => e.name));
    
    // Get first evaluator
    const firstEvaluator = evaluatorMetadata.length > 0 ? evaluatorMetadata[0] : null;
    
    if (!firstEvaluator) {
      console.warn("No evaluator metadata available for creating conditions");
      return {
        field: '',
        operator: '',
        value: '',
        negate: false,
      };
    }
    
    // Get first field from first evaluator
    const firstField = firstEvaluator.supportedFields.length > 0 
      ? firstEvaluator.supportedFields[0].name 
      : '';
    
    // Get first operator for that field
    let firstOperator = '';
    if (firstField && firstEvaluator.supportedOperators?.[firstField]?.length > 0) {
      firstOperator = firstEvaluator.supportedOperators[firstField][0].name;
    }
    
    console.log(`Creating condition with evaluator: ${firstEvaluator.name}, field: ${firstField}, operator: ${firstOperator}`);
    
    // Create a fully initialized condition
    return {
      field: firstField,
      operator: firstOperator,
      value: '',
      negate: false,
    };
  };

  // Create an empty group with one empty condition
  const createEmptyGroup = (): IConditionGroup => ({
    operator: 'AND',
    conditions: [createEmptyCondition()],
    negate: false,
  });

  // Initialize conditions with proper fields when metadata is loaded
  const initializeConditionsWithFields = useCallback(() => {
    if (!Array.isArray(value.conditions) || value.conditions.length === 0 || !evaluatorMetadata.length) {
      return;
    }
    
    const availableFields = getAllFields(evaluatorMetadata);
    if (availableFields.length === 0) {
      return;
    }
    
    // Check if any condition has an empty field using type guards
    const needsUpdate = value.conditions.some(condition => 
      condition && 
      typeof condition === 'object' && 
      // Make sure it's not a condition group (which has an 'operator' and 'conditions' array)
      !('conditions' in condition && Array.isArray((condition as IConditionGroup).conditions)) &&
      // Make sure it's a condition with a 'field' property
      'field' in condition && 
      !(condition as ICondition).field
    );
    
    if (needsUpdate) {
      console.log("Conditions need field updates:", value.conditions);
      
      const updatedConditions = value.conditions.map(condition => {
        // Use the same type guard to safely update conditions
        if (
          condition && 
          typeof condition === 'object' && 
          !('conditions' in condition && Array.isArray((condition as IConditionGroup).conditions)) &&
          'field' in condition && 
          !(condition as ICondition).field
        ) {
          // Get first evaluator
          const firstEvaluator = evaluatorMetadata[0];
          
          // Get first field 
          const firstField = availableFields[0];
          
          // Get first operator
          let firstOperator = '';
          if (firstEvaluator.supportedOperators?.[firstField]?.length > 0) {
            firstOperator = firstEvaluator.supportedOperators[firstField][0].name;
          }
          
          console.log(`Updating condition with field: ${firstField}, operator: ${firstOperator}`);
          
          return {
            ...(condition as ICondition),
            field: firstField,
            operator: firstOperator,
            value: ''
          };
        }
        return condition;
      });
      
      onChange({
        ...value,
        conditions: updatedConditions
      });
    }
  }, [value, evaluatorMetadata, onChange]);

  // Initialize conditions when metadata is loaded
  useEffect(() => {
    if (evaluatorMetadata.length > 0) {
      // If there are no conditions, create an initial one
      if (!value.conditions || value.conditions.length === 0) {
        console.log("No conditions exist, creating initial condition");
        onChange({
          ...value,
          conditions: [createEmptyCondition()]
        });
      } else {
        // Otherwise make sure existing conditions have fields
        initializeConditionsWithFields();
      }
    }
  }, [evaluatorMetadata, initializeConditionsWithFields, onChange, value]);

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
    console.log("Adding new condition:", newCondition);
    
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
    console.log("Adding new group:", newGroup);
    
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
      conditions:
        newConditions.length > 0 ? newConditions : [createEmptyCondition()],
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
  
  console.log("Rendering condition group with conditions:", conditions.length);

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
          // Create a unique key based on condition properties plus index
          const conditionKey = `condition-${index}-${Date.now()}`;
          
          // Improved type checking for condition vs. condition group
          const isGroup = condition && 
                          typeof condition === 'object' && 
                          'conditions' in condition &&
                          Array.isArray((condition as IConditionGroup).conditions);
          
          console.log(`Rendering condition ${index}, isGroup: ${isGroup}`);
          
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
                // Render single condition - explicitly cast to expected type
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