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
    return Object.entries(ContentCertifications).map(([region, data]) => ({
      label: data.label,
      options: [
        ...(data.movie || []).map(cert => ({
          label: cert.label,
          // Make the value unique by prefixing with region code to prevent duplicate keys
          value: `${region}-${cert.value}`,
        })),
        ...(data.tv || []).map(cert => ({
          label: cert.label,
          // Make the value unique by prefixing with region code to prevent duplicate keys
          value: `${region}-${cert.value}`,
        })),
        ...(data.all || []).map(cert => ({
          label: cert.label,
          // Make the value unique by prefixing with region code to prevent duplicate keys
          value: `${region}-${cert.value}`,
        }))
      ]
    }));
  }, []);

  // Transform the field value to handle region-prefixed values
  const transformedValue = useMemo(() => {
    const rawValue = field.value;
    if (!rawValue) return [];
    
    // If already prefixed, return as is
    if (Array.isArray(rawValue) && rawValue.every(v => typeof v === 'string' && v.includes('-'))) {
      return rawValue;
    }
    
    // Transform raw values to prefixed format
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const result: string[] = [];
    
    values.forEach(val => {
      Object.entries(ContentCertifications).forEach(([region, data]) => {
        [...(data.movie || []), ...(data.tv || []), ...(data.all || [])].forEach(cert => {
          if (cert.value === val) {
            result.push(`${region}-${cert.value}`);
          }
        });
      });
    });
    
    return result;
  }, [field.value]);

  // Transform selected values back to raw format
  const handleValueChange = (values: string[]) => {
    // Extract certification value without region prefix
    const rawValues = values.map(value => {
      const parts = value.split('-');
      return parts[1] || value; // Fallback to original value if no hyphen found
    });
    
    // Remove duplicates
    const uniqueValues = Array.from(new Set(rawValues));
    
    field.onChange(uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues);
  };

  return (
    <MultiSelect
      options={groupedOptions}
      onValueChange={handleValueChange}
      defaultValue={transformedValue}
      placeholder="Select certification(s)"
      modalPopover={true}
      maxCount={2}
    />
  )
}

export default CertificationMultiSelect