import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isValid } from 'date-fns';

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
 * Renders a dropdown selector for day of the week and a dropdown for time in 15-minute intervals.
 *
 * Allows users to select a day and a time, then calls the provided callback with the updated Date and selected day string. If no initial date is provided or the date is invalid, the time defaults to "00:00". Both selectors can be disabled, and additional CSS classes can be applied to the container.
 *
 * @param value - Optional initial date used to display the selected time.
 * @param onChange - Callback invoked with the new Date and selected day string when a selection changes.
 * @param disabled - If true, disables both dropdown selectors.
 * @param className - Additional CSS classes for the container.
 * @param dayOfWeek - Optional initial day selection; defaults to '*'.
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
  const [selectedDay, setSelectedDay] = useState<string>(dayOfWeek);
  
  // Update time when value prop changes
  useEffect(() => {
    setTime(formatTimeValue(value));
  }, [value]);
  
  // Update day selection when prop changes
  useEffect(() => {
    setSelectedDay(dayOfWeek);
  }, [dayOfWeek]);
  
  const handleTimeChange = (newTimeString: string) => {
    setTime(newTimeString);
    
    const [hours, minutes] = newTimeString.split(':').map(Number);
    const newDate = value ? new Date(value) : new Date();
    newDate.setHours(hours, minutes, 0, 0);
    
    onChange(newDate, selectedDay);
  };
  
  const handleDayChange = (newDay: string) => {
    setSelectedDay(newDay);
    onChange(value || new Date(), newDay);
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