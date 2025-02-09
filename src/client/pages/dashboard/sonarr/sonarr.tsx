import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConfig } from '@/context/context'
import SonarrGenreRouting from '@/components/sonarr/sonarr-genre-routing'
import { InstanceCard } from '@/components/sonarr/sonarr-instance-card'
import InstanceCardSkeleton from '@/components/sonarr/instance-card-skeleton'

export default function SonarrConfigPage() {
  const {
    sonarrInstances: instances,
    fetchSonarrInstanceData: fetchInstanceData,
    fetchSonarrInstances: fetchInstances,
    fetchAllSonarrInstanceData: fetchAllInstanceData,
    initialize,
    instancesLoading,
    isInitialized,
  } = useConfig()

  const hasInitializedRef = useRef(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)
  const API_KEY_PLACEHOLDER = 'placeholder'

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

  // Wait for initialization before showing anything
  if (!isInitialized) {
    return null
  }

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  // Only show loading state if we know we have real instances
  if (instancesLoading && hasRealInstances) {
    return (
      <ScrollArea className="h-full">
        <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
            </div>
            <div className="grid gap-4">
              <InstanceCardSkeleton />
            </div>
            <SonarrGenreRouting />
          </div>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
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
            <SonarrGenreRouting />
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
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    instances={instances}
                    fetchInstanceData={fetchInstanceData}
                    fetchInstances={fetchInstances}
                    fetchAllInstanceData={fetchAllInstanceData}
                  />
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
                  instances={instances}
                  fetchInstanceData={fetchInstanceData}
                  fetchInstances={fetchInstances}
                  setShowInstanceCard={setShowInstanceCard}
                  fetchAllInstanceData={fetchAllInstanceData}
                />
              )}
            </div>
            <SonarrGenreRouting />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}