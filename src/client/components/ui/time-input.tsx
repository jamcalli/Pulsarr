import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

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
 * A React component that renders selectable time and day options.
 *
 * Displays two dropdown menus: one for choosing a day of the week from a predefined list and another for selecting a time in 15-minute intervals. The displayed time is formatted as "HH:mm" from an optional date value; if no date is provided, it defaults to "00:00". When the time or day is changed, the component invokes the onChange callback with the new Date (or current date) and the selected day.
 *
 * @param value - Optional date used to initialize the time display.
 * @param onChange - Callback invoked with the updated Date and selected day when a change is made.
 * @param disabled - Optional flag to disable both dropdown menus.
 * @param className - Optional additional CSS classes for styling.
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
    if (!date) return "00:00";
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