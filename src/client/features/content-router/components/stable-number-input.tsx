import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

interface StableNumberInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  min?: string
  max?: string
  step?: string
  id?: string
  className?: string
}

/**
 * Number input that maintains focus during typing.
 * Uses internal state to prevent cursor jumping when parent re-renders.
 */
export function StableNumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  id,
  className,
}: StableNumberInputProps) {
  const [internalValue, setInternalValue] = useState(value)

  useEffect(() => {
    setInternalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value)
    onChange(e)
  }

  return (
    <Input
      type="number"
      value={internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      id={id}
      className={className ?? 'flex-1'}
    />
  )
}
