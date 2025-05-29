import { useMemo } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { ContentCertifications } from '@/features/content-router/types/route-types'

interface CertificationMultiSelectProps {
  field: ControllerRenderProps<Record<string, unknown>, 'certification'>
}

const CertificationMultiSelect = ({
  field,
}: CertificationMultiSelectProps) => {

  const groupedOptions = useMemo(() => {
    return Object.entries(ContentCertifications).map(([, data]) => ({
      label: data.label,
      options: [
        ...(data.movie || []).map(cert => ({
          label: cert.label,
          value: cert.value,
        })),
        ...(data.tv || []).map(cert => ({
          label: cert.label,
          value: cert.value,
        })),
        ...(data.all || []).map(cert => ({
          label: cert.label,
          value: cert.value,
        }))
      ]
    }));
  }, []);

  // Ensure value is always an array
  const currentValue = useMemo(() => {
    if (!field.value) return [];
    if (Array.isArray(field.value)) return field.value as string[];
    return [field.value as string];
  }, [field.value]);

  // Handle value change with proper array handling
  const handleValueChange = (values: string[]) => {
    // The MultiSelect already handles deduplication when same value appears in multiple groups
    // Just pass the unique values to the form
    const uniqueValues = Array.from(new Set(values));
    
    // Call onChange with the new value
    field.onChange(uniqueValues);
  };

  return (
    <MultiSelect
      options={groupedOptions}
      onValueChange={handleValueChange}
      value={currentValue}
      placeholder="Select certification(s)"
      modalPopover={true}
      maxCount={2}
    />
  )
}

export default CertificationMultiSelect
