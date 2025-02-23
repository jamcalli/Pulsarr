import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useSonarrStore } from '@/stores/sonarrStore'
import SonarrGenreRouting from '@/components/sonarr/sonarr-genre-routing'
import { InstanceCard } from '@/components/sonarr/sonarr-instance-card'
import InstanceCardSkeleton from '@/components/sonarr/sonarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/types/sonarr/constants'

export default function SonarrConfigPage() {
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
    return (
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
            <SonarrGenreRouting />
          </div>
        )}
      </div>
  )
}
