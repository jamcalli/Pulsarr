import { format, isValid } from 'date-fns';
import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimeSelectorProps {
  value?: Date;
  onChange: (date: Date, dayOfWeek?: string) => void;
  disabled?: boolean;
  className?: string;
  dayOfWeek?: string;
}

type DayOption = {
  value: string;
  label: string;
};

const DAYS_OF_WEEK: DayOption[] = [
  { value: '*', label: 'Every day' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

/**
 * Validates that a dayOfWeek value is valid for cron expressions using cron-validate.
 * @param value - The dayOfWeek value to validate
 * @returns A valid dayOfWeek value ('*' or 0-6, with 7 normalized to 0)
 */
const validateDayOfWeek = (value: string | undefined): string => {
  if (!value) return '*'
  
  // Allow '*' for every day
  if (value === '*') return '*'
  
  // Test with a simple cron expression to validate the day value
  // Using cron-validate which is already installed for backend validation
  try {
    // Use require for cron-validate as it's a CommonJS module
    const cronValidate = require('cron-validate').default || require('cron-validate')
    const testCron = `0 12 * * ${value}` // Test cron: noon on the specified day
    const result = cronValidate(testCron)
    
    if (result.isValid()) {
      // Normalize day 7 (Sunday) to 0 for consistency with DAYS_OF_WEEK array
      return value === '7' ? '0' : value
    }
  } catch (_error) {
    // If cron-validate fails to load or throws, fall back to basic validation
    console.warn('cron-validate not available, using fallback validation')
  }
  
  // Fallback: basic validation for 0-6 and 7 (which we normalize to 0)
  if (/^[0-7]$/.test(value)) {
    return value === '7' ? '0' : value
  }
  
  console.warn(
    `Invalid dayOfWeek value "${value}" detected, falling back to "*"`
  )
  return '*'
};

/**
 * A React component that provides dropdown selectors for choosing a day of the week and a time in 15-minute intervals.
 *
 * Users can select a day and a time, and the component invokes the provided callback with the updated Date and selected day string. If the initial date is missing or invalid, the time defaults to "00:00". Both selectors can be disabled, and custom CSS classes can be applied to the container.
 *
 * @param value - The initial date used to display the selected time, if valid.
 * @param onChange - Callback called with the new Date and selected day string when a selection changes.
 * @param disabled - Disables both dropdown selectors when true.
 * @param className - Additional CSS classes for the container.
 * @param dayOfWeek - The initial day selection; defaults to '*'.
 */
export function TimeSelector({ 
  value, 
  onChange, 
  disabled = false,
  className,
  dayOfWeek = '*'
}: TimeSelectorProps) {
  // Format the time value as "HH:MM"
  const formatTimeValue = (date?: Date): string => {
    if (!date || !isValid(date)) return "00:00";
    return format(date, "HH:mm");
  };
  
  const [time, setTime] = useState<string>(formatTimeValue(value));
  const [selectedDay, setSelectedDay] = useState<string>(validateDayOfWeek(dayOfWeek));
  
  // Update time when value prop changes
  useEffect(() => {
    setTime(formatTimeValue(value));
  }, [value]);
  
  // Update day selection when prop changes
  useEffect(() => {
    setSelectedDay(validateDayOfWeek(dayOfWeek));
  }, [dayOfWeek]);
  
  const handleTimeChange = (newTimeString: string) => {
    setTime(newTimeString);
    
    const [hours, minutes] = newTimeString.split(':').map(Number);
    const newDate = value ? new Date(value) : new Date();
    newDate.setHours(hours, minutes, 0, 0);
    
    // Validate the dayOfWeek before passing it to onChange
    const validatedDayOfWeek = validateDayOfWeek(selectedDay);
    onChange(newDate, validatedDayOfWeek);
  };
  
  const handleDayChange = (newDay: string) => {
    // Validate the dayOfWeek before setting it and calling onChange
    const validatedDayOfWeek = validateDayOfWeek(newDay);
    setSelectedDay(validatedDayOfWeek);
    onChange(value || new Date(), validatedDayOfWeek);
  };
  
  return (
    <div className={`flex gap-2 items-center ${className}`}>
      <Select
        value={selectedDay}
        onValueChange={handleDayChange}
        disabled={disabled}
      >
        <SelectTrigger className="font-normal focus:ring-0 w-[140px] focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAYS_OF_WEEK.map((day) => (
            <SelectItem key={day.value} value={day.value}>
              {day.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select
        value={time}
        onValueChange={handleTimeChange}
        disabled={disabled}
      >
        <SelectTrigger className="font-normal focus:ring-0 w-[120px] focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <ScrollArea className="h-[15rem]">
            {Array.from({ length: 96 }).map((_, i) => {
              const hour = Math.floor(i / 4).toString().padStart(2, "0");
              const minute = ((i % 4) * 15).toString().padStart(2, "0");
              const timeValue = `${hour}:${minute}`;
              
              return (
                <SelectItem key={i} value={timeValue}>
                  {timeValue}
                </SelectItem>
              );
            })}
          </ScrollArea>
        </SelectContent>
      </Select>
    </div>
  );
}

export default TimeSelector;