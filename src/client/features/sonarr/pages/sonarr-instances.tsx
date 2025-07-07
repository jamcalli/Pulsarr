import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useConfigStore } from '@/stores/configStore'
import { InstanceCard } from '@/features/sonarr/components/instance/sonarr-instance-card'
import SonarrPageSkeleton from '@/features/sonarr/components/instance/sonarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Renders the page for managing Sonarr instances, enabling users to add, view, and configure their Sonarr connections.
 *
 * Initializes both Sonarr and configuration stores on mount, manages loading and initialization states, and conditionally displays UI for adding new instances or listing existing ones.
 *
 * @returns The React component for the Sonarr Instances management page.
 */
export default function SonarrInstancesPage() {
  const instances = useSonarrStore((state) => state.instances)
  const instancesLoading = useSonarrStore((state) => state.instancesLoading)
  const isInitialized = useSonarrStore((state) => state.isInitialized)
  const initialize = useSonarrStore((state) => state.initialize)

  // Add config store initialization for session monitoring support
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      configInitialize() // Initialize config store for session monitoring
      hasInitializedRef.current = true
    }
  }, [initialize, configInitialize])

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
    return <SonarrPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Sonarr Instances</h2>
        <p className="text-sm text-foreground mt-1">
          Manage and configure your Sonarr instances for TV show automation
        </p>
      </div>

      <div>
        {isPlaceholderInstance && !showInstanceCard ? (
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
              <Button onClick={addInstance}>Add Your First Instance</Button>
            </div>
            <div className="text-center py-8 text-foreground">
              <p>No Sonarr instances configured</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
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
                    monitorNewItems: 'all',
                    searchOnAdd: true,
                    createSeasonFolders: false,
                    tags: [],
                    isDefault: instances.length === 0,
                    qualityProfile: '',
                    rootFolder: '',
                  }}
                  setShowInstanceCard={setShowInstanceCard}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
