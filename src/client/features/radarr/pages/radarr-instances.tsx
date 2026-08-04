import { Network } from 'lucide-react'
import { useState } from 'react'
import { NetworkConfigCredenza } from '@/components/network-config-credenza'
import { Button } from '@/components/ui/button'
import { PageError } from '@/components/ui/page-error'
import RadarrPageSkeleton from '@/features/radarr/components/instance/radarr-card-skeleton'
import { InstanceCard as RadarrInstanceCard } from '@/features/radarr/components/instance/radarr-instance-card'
import { useRadarrInstancesQuery } from '@/features/radarr/hooks/instance/useRadarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { apiErrorMessage } from '@/lib/tanstackApi'

/**
 * Renders the management page for configuring and maintaining Radarr instances.
 *
 * @returns The React component for the Radarr Instances management page.
 */
export default function RadarrInstancesPage() {
  const { data, isLoading, isError, error, refetch } = useRadarrInstancesQuery()
  const instances = data ?? []

  const [showInstanceCard, setShowInstanceCard] = useState(false)
  const [showNetworkConfig, setShowNetworkConfig] = useState(false)

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
        message={apiErrorMessage(error) ?? 'Failed to load Radarr instances'}
        onRetry={() => refetch()}
      />
    )
  }

  if (data === undefined) {
    return <RadarrPageSkeleton />
  }

  if (isLoading && hasRealInstances) {
    return <RadarrPageSkeleton />
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Radarr Instances</h2>
        <p className="text-sm text-foreground mt-1">
          Configure Radarr instances to automatically download movies
        </p>
      </div>

      <div>
        {isPlaceholderInstance && !showInstanceCard ? (
          <div className="text-center py-8 text-foreground">
            <p>No Radarr instances configured</p>
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
                    monitor: 'movieOnly',
                    searchOnAdd: true,
                    tags: [],
                    isDefault: !hasRealInstances,
                    qualityProfile: '',
                    rootFolder: '',
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
