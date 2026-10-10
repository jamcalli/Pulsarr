import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFieldContext } from '@/lib/form-context'
import {
  cronForDayTime,
  parseDayTimeCron,
  scheduleDayOptions,
  scheduleTimeOptions,
  scheduleTimeValue,
  timeFromScheduleValue,
} from '@/lib/schedule'
import { withStoredOption } from '@/lib/select-options'

interface ScheduleFieldProps {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
}

export function ScheduleField({
  label,
  description,
  disabled,
  orientation = 'responsive',
}: ScheduleFieldProps) {
  const field = useFieldContext<string>()
  const labelId = `${field.name}-label`
  const expression = field.state.value
  const schedule = parseDayTimeCron(expression)
  const dayOptions = scheduleDayOptions()
  const custom = schedule || expression === '' ? null : expression
  const dayItems = withStoredOption(dayOptions, custom, `Custom: ${custom}`)
  const timeItems = scheduleTimeOptions(schedule)

  const selects = [
    {
      ariaLabel: 'Day',
      placeholder: 'Pick a day',
      items: dayItems,
      value: schedule?.day ?? custom,
      onChange: (next: string | null) => {
        const day = dayOptions.find((option) => option.value === next)
        if (!day) return
        field.handleChange(
          cronForDayTime({
            day: day.value,
            hour: schedule?.hour ?? 0,
            minute: schedule?.minute ?? 0,
          }),
        )
      },
    },
    {
      ariaLabel: 'Time',
      placeholder: 'Pick a time',
      items: timeItems,
      value: schedule
        ? scheduleTimeValue(schedule.hour, schedule.minute)
        : null,
      onChange: (next: string | null) => {
        if (next === null) return
        field.handleChange(
          cronForDayTime({
            day: schedule?.day ?? '*',
            ...timeFromScheduleValue(next),
          }),
        )
      },
    },
  ]

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation={orientation}
      labelId={labelId}
    >
      <fieldset
        aria-labelledby={labelId}
        className={cn(
          'grid min-w-0 grid-cols-2 gap-2',
          orientation === 'responsive' && '@md/field-group:basis-72',
        )}
      >
        {selects.map((select) => (
          <Select
            key={select.ariaLabel}
            items={select.items}
            value={select.value}
            disabled={disabled}
            onValueChange={select.onChange}
          >
            <SelectTrigger
              aria-label={select.ariaLabel}
              className="w-full"
              onBlur={field.handleBlur}
            >
              <SelectValue placeholder={select.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {select.items.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </fieldset>
    </FieldRow>
  )
}
