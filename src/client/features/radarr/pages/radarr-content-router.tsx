import { useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import DefaultRoutingBehaviorSection from '@/features/content-router/components/default-routing-behavior-section'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useConfigStore } from '@/stores/configStore'

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

  // Route cards read session-monitoring config, so it must be initialized here
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    const initializeData = async () => {
      if (!hasInitializedRef.current) {
        await initialize(true)
        configInitialize()

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
  }, [initialize, fetchInstanceData, instances, configInitialize])

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

  const defaultInstance = instances.find((instance) => instance.isDefault)

  return (
    <div>
      <Tabs defaultValue="content-routes" className="w-full">
        <TabsContent value="content-routes" className="mt-0">
          <DefaultRoutingBehaviorSection
            contentTypeLabel="Radarr"
            defaultInstanceName={defaultInstance?.name}
            skipDefaultRoutingWhenNoMatch={
              defaultInstance?.skipDefaultRoutingWhenNoMatch ?? false
            }
          />
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
