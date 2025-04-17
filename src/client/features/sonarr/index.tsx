import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { InstanceCard } from '@/features/sonarr/components/instance/sonarr-instance-card'
import InstanceCardSkeleton from '@/features/sonarr/components/instance/sonarr-card-skeleton'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Displays the Sonarr configuration interface with tabbed navigation for managing instances and content routes.
 *
 * Provides a UI for adding, viewing, and configuring Sonarr instances, as well as managing content routes. The interface separates instance management and content route configuration into distinct tabs. Handles initialization and loading states internally.
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
            <h2 className="text-2xl font-bold text-text">
              Sonarr Configuration
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
        Sonarr Configuration
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
                  Sonarr Instances
                </h2>
                <Button onClick={addInstance}>Add Your First Instance</Button>
              </div>
              <div className="text-center py-8 text-text">
                <p>No Sonarr instances configured</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-text">
                  Sonarr Instances
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
                      name: `Sonarr Instance ${
                        instances.filter(
                          (i) => i.apiKey !== API_KEY_PLACEHOLDER,
                        ).length + 1
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
            </div>
          )}
        </TabsContent>

        {/* Content Routes Tab */}
        <TabsContent value="content-routes">
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
