import type { TmdbRegion, TmdbRegionsSuccessResponse } from '@root/schemas/tmdb/tmdb.schema'
import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { useConfigStore } from '@/stores/configStore'

interface TmdbRegionSelectorProps {
  onRegionChange?: () => Promise<void>
}

/**
 * A region selector component for TMDB content that updates the global TMDB region configuration.
 *
 * Fetches available regions from the TMDB API and displays them in a dropdown. When a region is selected,
 * it updates the global configuration and optionally triggers a callback for dependent components to refetch data.
 *
 * @param onRegionChange - Optional callback invoked after the region is changed, typically to refetch region-dependent data
 */
export function TmdbRegionSelector({ onRegionChange }: TmdbRegionSelectorProps) {
  const { config, updateConfig } = useConfigStore()
  const [availableRegions, setAvailableRegions] = useState<TmdbRegion[]>([])
  const [loadingRegions, setLoadingRegions] = useState(false)

  // Fetch available regions on component mount
  useEffect(() => {
    const fetchRegions = async () => {
      if (availableRegions.length > 0) return // Already loaded

      setLoadingRegions(true)
      try {
        const response = await fetch(api('/v1/tmdb/regions'))
        const data: TmdbRegionsSuccessResponse = await response.json()

        if (data.success && data.regions) {
          const sortedRegions = data.regions.sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          setAvailableRegions(sortedRegions)
        }
      } catch (error) {
        console.error('Failed to fetch TMDB regions:', error)
      } finally {
        setLoadingRegions(false)
      }
    }

    fetchRegions()
  }, [availableRegions.length])

  // Handle region change
  const handleRegionChange = async (newRegion: string) => {
    if (!config) return

    try {
      await updateConfig({ tmdbRegion: newRegion })
      // Refetch metadata with new region if callback provided
      if (onRegionChange) {
        await onRegionChange()
      }
    } catch (error) {
      console.error('Failed to update TMDB region:', error)
    }
  }

  // Get current region info for display
  const currentRegion = availableRegions.find(
    (region) => region.code === (config?.tmdbRegion || 'US'),
  )
  const currentRegionName = currentRegion?.name || 'United States'

  if (availableRegions.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Globe className="w-4 h-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Global TMDB region setting. Affects streaming providers and availability data.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Select
        value={config?.tmdbRegion || 'US'}
        onValueChange={handleRegionChange}
        disabled={loadingRegions || !config}
      >
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue
            placeholder={loadingRegions ? 'Loading...' : currentRegionName}
          />
        </SelectTrigger>
        <SelectContent align="end">
          {availableRegions.map((region) => (
            <SelectItem key={region.code} value={region.code}>
              {region.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
