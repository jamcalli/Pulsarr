import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRadarrStore } from '@/stores/radarr/radarrStore'
import RadarrGenreRouting from '@/components/radarr/radarr-genre-routing'
import { InstanceCard } from '@/components/radarr/radarr-instance-card'
import InstanceCardSkeleton from '@/components/radarr/radarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/types/radarr/constants'

export default function RadarrConfigPage() {
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

  if (!isInitialized) {
    return null
  }

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  if (instancesLoading && hasRealInstances) {
    return (
      <ScrollArea className="h-full">
        <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-text">Radarr Instances</h2>
            </div>
            <div className="grid gap-4">
              <InstanceCardSkeleton />
            </div>
            <RadarrGenreRouting />
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
              <h2 className="text-2xl font-bold text-text">Radarr Instances</h2>
            </div>
            <div className="text-center py-8 text-text">
              <p>No Radarr instances configured</p>
              <Button onClick={addInstance} className="mt-4">
                Add Your First Instance
              </Button>
            </div>
            <RadarrGenreRouting />
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
            <RadarrGenreRouting />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
