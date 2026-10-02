import { Network } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useConfig } from '@/hooks/useConfig'
import { PageError } from '@/legacy/components/page-error'
import { Button } from '@/legacy/components/ui/button'
import { NetworkConfigCredenza } from '@/legacy/features/library/components/instances/network-config-credenza'
import SonarrPageSkeleton from '@/legacy/features/library/components/sonarr/sonarr-card-skeleton'
import { InstanceCard } from '@/legacy/features/library/components/sonarr/sonarr-instance-card'
import { useSonarrInstancesQuery } from '@/legacy/hooks/arr/useSonarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/legacy/lib/arr/sonarr-constants'
import { apiErrorMessage } from '@/lib/tanstackApi'

/**
 * Renders the page for managing Sonarr instances, enabling users to add, view, and configure their Sonarr connections.
 *
 * @returns The React component for the Sonarr Instances management page.
 */
export default function SonarrInstancesPage() {
  const { data, isLoading, isError, error, refetch } = useSonarrInstancesQuery()
  const instances = data ?? []

  // Initialize config for session monitoring support
  const { initialize: configInitialize } = useConfig()

  const hasInitializedRef = useRef(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)
  const [showNetworkConfig, setShowNetworkConfig] = useState(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize() // Initialize config for session monitoring
      hasInitializedRef.current = true
    }
  }, [configInitialize])

  const addInstance = () => {
    setShowInstanceCard(true)
  }

  const isPlaceholderInstance =
    instances.length === 1 && instances[0].apiKey === API_KEY_PLACEHOLDER

  const hasRealInstances = instances.some(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )

  if (isError && data === undefined) {
    return (
      <PageError
        message={apiErrorMessage(error) ?? 'Failed to load Sonarr instances'}
        onRetry={() => refetch()}
      />
    )
  }

  if (data === undefined) {
    return <SonarrPageSkeleton />
  }

  if (isLoading && hasRealInstances) {
    return <SonarrPageSkeleton />
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Sonarr Instances</h2>
        <p className="text-sm text-foreground mt-1">
          Manage and configure your Sonarr instances for TV show automation
        </p>
      </div>

      <div>
        {isPlaceholderInstance && !showInstanceCard ? (
          <div className="text-center py-8 text-foreground">
            <p>No Sonarr instances configured</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button onClick={addInstance}>Add Your First Instance</Button>
              <Button variant="blue" onClick={() => setShowNetworkConfig(true)}>
                <Network />
                Network Settings
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="flex items-center gap-2">
              <Button onClick={addInstance}>Add Instance</Button>
              <Button variant="blue" onClick={() => setShowNetworkConfig(true)}>
                <Network />
                Network Settings
              </Button>
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
                    isDefault: !hasRealInstances,
                    qualityProfile: '',
                    rootFolder: '',
                    seriesType: 'standard',
                    skipDefaultRoutingWhenNoMatch: false,
                  }}
                  setShowInstanceCard={setShowInstanceCard}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <NetworkConfigCredenza
        open={showNetworkConfig}
        onOpenChange={setShowNetworkConfig}
      />
    </div>
  )
}
