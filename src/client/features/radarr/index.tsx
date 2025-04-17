import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { InstanceCard } from '@/features/radarr/components/instance/radarr-instance-card'
import InstanceCardSkeleton from '@/features/radarr/components/instance/radarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * Renders the Radarr configuration page.
 *
 * This component manages the configuration and display of Radarr instances by retrieving data such as instances
 * and genres from a global store. It ensures initialization occurs on the first render and lazily fetches genre
 * data when the associated dropdown is opened. Depending on the loading state and the presence of real or placeholder
 * instances, it conditionally displays a loading skeleton, an instance list with options to add new instances, or a prompt
 * to configure the first Radarr instance.
 */
export default function RadarrConfigPage() {
  // Get these from the store
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres) // Add this
  const fetchGenres = useRadarrStore((state) => state.fetchGenres) // Add this
  const instancesLoading = useRadarrStore((state) => state.instancesLoading)
  const isInitialized = useRadarrStore((state) => state.isInitialized)
  const initialize = useRadarrStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  // You can also create this as a separate function to reuse
  const handleGenreDropdownOpen = async () => {
    if (!genres.length) {
      await fetchGenres()
    }
  }

  const addInstance = () => {
    setShowInstanceCard(true)
  }

  const isPlaceholderInstance =
    instances.length === 1 && instances[0].apiKey === API_KEY_PLACEHOLDER

  if (!isInitialized) {
    return null
  }

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  if (instancesLoading && hasRealInstances) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Radarr Instances</h2>
          </div>
          <div className="grid gap-4">
            <InstanceCardSkeleton />
          </div>
          <AccordionContentRouterSection
            targetType="radarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {isPlaceholderInstance && !showInstanceCard ? (
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Radarr Instances</h2>
          </div>
          <div className="text-center py-8 text-text">
            <p>No Radarr instances configured</p>
            <Button onClick={addInstance} className="mt-4">
              Add Your First Instance
            </Button>
          </div>
          <AccordionContentRouterSection
            targetType="radarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Radarr Instances</h2>
            <Button onClick={addInstance}>Add Instance</Button>
          </div>
          <div className="grid gap-4">
            {instances.map((instance) =>
              instance.apiKey !== API_KEY_PLACEHOLDER ? (
                <InstanceCard key={instance.id} instance={instance} />
              ) : null,
            )}
            {showInstanceCard && (
              <InstanceCard
                instance={{
                  id: -1,
                  name: `Radarr Instance ${
                    instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER)
                      .length + 1
                  }`,
                  baseUrl: 'http://localhost:7878',
                  apiKey: '',
                  bypassIgnored: false,
                  tags: [],
                  isDefault: instances.length === 0,
                  qualityProfile: '',
                  rootFolder: '',
                }}
                setShowInstanceCard={setShowInstanceCard}
              />
            )}
          </div>
          <AccordionContentRouterSection
            targetType="radarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </div>
      )}
    </div>
  )
}
