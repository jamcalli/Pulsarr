import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { InstanceCard } from '@/features/radarr/components/instance/radarr-instance-card'
import InstanceCardSkeleton from '@/features/radarr/components/instance/radarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * Displays the Radarr configuration interface with tabs for managing Radarr instances and content routing.
 *
 * Users can add, view, and configure Radarr instances, as well as manage content routing settings. The component initializes Radarr data on first render and conditionally renders loading states, configuration forms, or informational messages based on the current application state.
 *
 * @returns The Radarr configuration page UI.
 */
export default function RadarrConfigPage() {
  // Get these from the store
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres)
  const fetchGenres = useRadarrStore((state) => state.fetchGenres)
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

  // Function to handle genre dropdown open
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
            <h2 className="text-2xl font-bold text-text">
              Radarr Configuration
            </h2>
          </div>
          <InstanceCardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h1 className="text-3xl font-bold text-text mb-6">
        Radarr Configuration
      </h1>

      <Tabs defaultValue="instances" className="w-full">
        <TabsList>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="content-routes">Content Routes</TabsTrigger>
        </TabsList>

        <Separator className="my-4" />

        {/* Instances Tab */}
        <TabsContent value="instances">
          {isPlaceholderInstance && !showInstanceCard ? (
            <div className="grid gap-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-text">
                  Radarr Instances
                </h2>
                <Button onClick={addInstance}>Add Your First Instance</Button>
              </div>
              <div className="text-center py-8 text-text">
                <p>No Radarr instances configured</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-text">
                  Radarr Instances
                </h2>
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
                        instances.filter(
                          (i) => i.apiKey !== API_KEY_PLACEHOLDER,
                        ).length + 1
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
            </div>
          )}
        </TabsContent>

        {/* Content Routes Tab */}
        <TabsContent value="content-routes">
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
