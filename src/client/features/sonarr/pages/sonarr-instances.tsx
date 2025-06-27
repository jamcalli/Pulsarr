import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { InstanceCard } from '@/features/sonarr/components/instance/sonarr-instance-card'
import SonarrPageSkeleton from '@/features/sonarr/components/instance/sonarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Standalone Sonarr Instances page for managing Sonarr instances.
 *
 * Allows users to add, view, and configure Sonarr instances. Handles initialization and loading states,
 * providing a dedicated interface for instance management separate from content routing.
 *
 * @returns The Sonarr Instances page component.
 */
export default function SonarrInstancesPage() {
  const instances = useSonarrStore((state) => state.instances)
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
