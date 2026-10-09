import { useId, useMemo } from 'react'
import { Input } from '@/components/ui/input'

function getTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

interface TimeZoneInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: string | null | undefined
  onChange: (value: string | null) => void
}

/**
 * Free-text IANA time zone input with browser-provided suggestions.
 * An empty value is reported as null so the field can mean "inherit".
 */
export function TimeZoneInput({
  value,
  onChange,
  ...props
}: TimeZoneInputProps) {
  const listId = useId()
  const timeZones = useMemo(getTimeZones, [])

  return (
    <>
      <Input
        {...props}
        list={listId}
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() || null)}
      />
      <datalist id={listId}>
        {timeZones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </>
  )
}
