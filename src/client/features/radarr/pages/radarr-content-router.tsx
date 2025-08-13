import { useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'

/**
 * Renders the Radarr Content Router configuration page, initializing Radarr instances and genres on mount and displaying the routing rule management UI when data is ready.
 *
 * Fetches data for valid Radarr instances and only renders the tabbed interface for managing content routing rules after initialization and loading are complete. Returns `null` while initialization or data loading is in progress.
 *
 * @returns The React component for the Radarr Content Router page.
 */
export default function RadarrContentRouterPage() {
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres)
  const fetchGenres = useRadarrStore((state) => state.fetchGenres)
  const instancesLoading = useRadarrStore((state) => state.instancesLoading)
  const isInitialized = useRadarrStore((state) => state.isInitialized)
  const initialize = useRadarrStore((state) => state.initialize)
  const fetchInstanceData = useRadarrStore((state) => state.fetchInstanceData)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    const initializeData = async () => {
      if (!hasInitializedRef.current) {
        await initialize(true)

        // Ensure instance data is fetched for all valid instances
        const validInstances = instances.filter(
          (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
        )

        await Promise.all(
          validInstances.map((instance) =>
            fetchInstanceData(instance.id.toString()),
          ),
        )

        hasInitializedRef.current = true
      }
    }

    initializeData()
  }, [initialize, fetchInstanceData, instances])

  const handleGenreDropdownOpen = async () => {
    if (!genres.length) {
      await fetchGenres()
    }
  }

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  if (!isInitialized) {
    return null
  }

  if (instancesLoading && hasRealInstances) {
    return null
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <Tabs defaultValue="content-routes" className="w-full">
        <TabsContent value="content-routes" className="mt-0">
          <AccordionContentRouterSection
            targetType="radarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
