import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { ContentCertifications } from '@/features/content-router/types/route-types'

interface CertificationMultiSelectProps {
  field: ControllerRenderProps<any, 'certification'>
}

const CertificationMultiSelect = ({
  field,
}: CertificationMultiSelectProps) => {

  const groupedOptions = Object.entries(ContentCertifications).map(([_, region]) => ({
    label: region.label,
    options: [
      ...(region.movie || []).map(cert => ({
        label: cert.label,
        value: cert.value,
      })),
      ...(region.tv || []).map(cert => ({
        label: cert.label,
        value: cert.value,
      })),
      ...(region.all || []).map(cert => ({
        label: cert.label,
        value: cert.value,
      }))
    ]
  }));

  return (
    <MultiSelect
      options={groupedOptions}
      isGrouped={true}
      onValueChange={(values) => {
        field.onChange(values.length === 1 ? values[0] : values)
      }}
      defaultValue={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
      placeholder="Select certification(s)"
      modalPopover={true}
      maxCount={2}
    />
  )
}

export default CertificationMultiSelect