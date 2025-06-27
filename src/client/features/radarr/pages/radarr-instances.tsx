import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { InstanceCard as RadarrInstanceCard } from '@/features/radarr/components/instance/radarr-instance-card'
import RadarrPageSkeleton from '@/features/radarr/components/instance/radarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * Standalone Radarr Instances page for managing Radarr instances.
 *
 * Provides a dedicated interface for configuring and managing Radarr instances,
 * including adding new instances, editing existing ones, and monitoring their status.
 *
 * @returns The Radarr Instances page component.
 */
export default function RadarrInstancesPage() {
  const instances = useRadarrStore((state) => state.instances)
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

  const addInstance = () => {
    setShowInstanceCard(true)
  }

  const isPlaceholderInstance =
    instances.length === 1 && instances[0].apiKey === API_KEY_PLACEHOLDER

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  if (!isInitialized) {
    return null
  }

  if (instancesLoading && hasRealInstances) {
    return <RadarrPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Radarr Instances</h2>
        <p className="text-sm text-foreground mt-1">
          Configure Radarr instances to automatically download movies
        </p>
      </div>

      <div>
        {isPlaceholderInstance && !showInstanceCard ? (
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
              <Button onClick={addInstance}>Add Your First Instance</Button>
            </div>
            <div className="text-center py-8 text-foreground">
              <p>No Radarr instances configured</p>
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
                  <RadarrInstanceCard key={instance.id} instance={instance} />
                ) : null,
              )}
              {showInstanceCard && (
                <RadarrInstanceCard
                  instance={{
                    id: -1,
                    name: `Radarr Instance ${
                      instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER)
                        .length + 1
                    }`,
                    baseUrl: 'http://localhost:7878',
                    apiKey: '',
                    bypassIgnored: false,
                    minimumAvailability: 'announced',
                    searchOnAdd: true,
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
