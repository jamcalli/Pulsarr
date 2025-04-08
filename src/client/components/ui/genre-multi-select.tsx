import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'

interface GenreMultiSelectProps {
  field: ControllerRenderProps<any, 'genre'>
  genres: string[]
}

const GenreMultiSelect = ({
  field,
  genres,
}: GenreMultiSelectProps) => {
  const options = genres.map(genre => ({
    label: genre,
    value: genre,
  }))

  return (
    <MultiSelect
      options={options}
      onValueChange={(values) => {
        field.onChange(values.length === 1 ? values[0] : values)
      }}
      defaultValue={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
      placeholder="Select genre(s)"
      modalPopover={true}
    />
  )
}

export default GenreMultiSelect