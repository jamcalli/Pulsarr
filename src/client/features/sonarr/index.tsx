import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import ContentRouterSection from '@/features/content-router/components/content-router-section'
import { InstanceCard } from '@/features/sonarr/components/instance/sonarr-instance-card'
import InstanceCardSkeleton from '@/features/sonarr/components/instance/sonarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Renders the Sonarr configuration page for managing Sonarr instances and their associated genres.
 *
 * This component initializes itself using the Sonarr store, conditionally rendering different UI states based on
 * whether instances are loading, if only a placeholder instance exists, or if real instances are present. It also provides
 * functionality for adding a new instance and fetching genre data asynchronously when the genre dropdown is opened.
 *
 * @returns A React element representing the Sonarr configuration interface, or null if the component hasn't been initialized.
 */
export default function SonarrConfigPage() {
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)
  const instancesLoading = useSonarrStore((state) => state.instancesLoading)
  const isInitialized = useSonarrStore((state) => state.isInitialized)
  const initialize = useSonarrStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  const addInstance = () => {
    setShowInstanceCard(true)
  }

  const handleGenreDropdownOpen = async () => {
    if (!genres.length) {
      await fetchGenres()
    }
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
            <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
          </div>
          <div className="grid gap-4">
            <InstanceCardSkeleton />
          </div>
          <ContentRouterSection
            targetType="sonarr"
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
            <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
          </div>
          <div className="text-center py-8 text-text">
            <p>No Sonarr instances configured</p>
            <Button onClick={addInstance} className="mt-4">
              Add Your First Instance
            </Button>
          </div>
          <ContentRouterSection
            targetType="sonarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
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
                  name: `Sonarr Instance ${
                    instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER)
                      .length + 1
                  }`,
                  baseUrl: 'http://localhost:8989',
                  apiKey: '',
                  bypassIgnored: false,
                  seasonMonitoring: 'all',
                  tags: [],
                  isDefault: instances.length === 0,
                  qualityProfile: '',
                  rootFolder: '',
                }}
                setShowInstanceCard={setShowInstanceCard}
              />
            )}
          </div>
          <ContentRouterSection
            targetType="sonarr"
            instances={instances}
            genres={genres}
            onGenreDropdownOpen={handleGenreDropdownOpen}
          />
        </div>
      )}
    </div>
  )
}
