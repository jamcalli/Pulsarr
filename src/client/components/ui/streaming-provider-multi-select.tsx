import { useEffect, useState } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfig } from '@/hooks/useConfig'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type TmdbWatchProvider = components['schemas']['TmdbWatchProvider']

interface StreamingServicesFormValues {
  streamingServices: number[]
}

interface StreamingProviderMultiSelectProps {
  field: ControllerRenderProps<StreamingServicesFormValues, 'streamingServices'>
  onDropdownOpen?: () => Promise<void>
}

const StreamingProviderMultiSelect = ({
  field,
  onDropdownOpen,
}: StreamingProviderMultiSelectProps) => {
  const [providers, setProviders] = useState<TmdbWatchProvider[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { config } = useConfig()

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setIsLoading(true)

        // Create minimum loading time promise for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Fetch providers operation
        const fetchOperation = async () => {
          const { data, error } = await apiFetch.GET('/v1/tmdb/providers')
          if (error) throw error

          if (data.success && data.providers) {
            setProviders(data.providers)
          }
        }

        // Run fetch and minimum loading time in parallel
        await Promise.all([fetchOperation(), minimumLoadingTime])
      } catch (error) {
        console.error('Failed to fetch streaming providers:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProviders()
  }, [config?.tmdbRegion])

  // Map provider_id (number) to provider_name (string) for display
  const options = providers.map((provider) => ({
    label: provider.provider_name,
    value: provider.provider_id.toString(), // Convert to string for MultiSelect
  }))

  // Ensure field value is an array of numbers
  const normalizedValue = Array.isArray(field.value)
    ? field.value
    : field.value
      ? [field.value]
      : []

 return (
   <MultiSelect
     options={options}
     onValueChange={(values) => {
       // Convert string values back to numbers for storage
       const numericValues = values.map((v) => Number(v))
       field.onChange(numericValues)
     }}
     value={normalizedValue.map((v) => String(v))}
     placeholder={isLoading ? 'Loading providers...' : 'Select streaming provider(s)'}
     modalPopover={true}
      maxCount={2}
      onDropdownOpen={onDropdownOpen}
      disabled={isLoading}
    />
  )
}

export default StreamingProviderMultiSelect
