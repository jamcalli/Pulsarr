import { useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useConfigStore } from '@/stores/configStore'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Displays the Sonarr Content Router page for managing content routing rules.
 *
 * Initializes Sonarr and configuration stores on mount, loads instance and genre data as needed, and renders a tabbed interface for configuring routing rules. The page is rendered only after all required data is loaded.
 *
 * @returns The Sonarr Content Router page component.
 */
export default function SonarrContentRouterPage() {
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)
  const instancesLoading = useSonarrStore((state) => state.instancesLoading)
  const isInitialized = useSonarrStore((state) => state.isInitialized)
  const initialize = useSonarrStore((state) => state.initialize)
  const fetchInstanceData = useSonarrStore((state) => state.fetchInstanceData)

  // Add config store initialization for session monitoring support
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    const initializeData = async () => {
      if (!hasInitializedRef.current) {
        await initialize(true)
        configInitialize() // Initialize config store for session monitoring

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

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <Tabs defaultValue="content-routes" className="w-full">
        <TabsContent value="content-routes" className="mt-0">
          <AccordionContentRouterSection
            targetType="sonarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
