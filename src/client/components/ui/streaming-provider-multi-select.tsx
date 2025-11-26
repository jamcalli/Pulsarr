import type { ProvidersResponse } from '@root/schemas/tmdb/get-providers.schema'
import type { TmdbWatchProvider } from '@root/schemas/tmdb/tmdb.schema'
import { useEffect, useState } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { api } from '@/lib/api'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { useConfigStore } from '@/stores/configStore'

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
  const config = useConfigStore((state) => state.config)

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
          const response = await fetch(api('/v1/tmdb/providers'))
          if (!response.ok) {
            throw new Error(`Failed to fetch providers: ${response.status}`)
          }
          const data: ProvidersResponse = await response.json()
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
