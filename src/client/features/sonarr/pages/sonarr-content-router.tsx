import { useEffect, useRef } from 'react'
import { PageError } from '@/components/ui/page-error'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useArrGenres } from '@/features/arr/useArrGenres'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { useSonarrInstancesQuery } from '@/features/sonarr/hooks/instance/useSonarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import { apiErrorMessage } from '@/lib/tanstackApi'
import { useConfigStore } from '@/stores/configStore'

/**
 * Displays the Sonarr Content Router page for managing content routing rules.
 *
 * @returns The Sonarr Content Router page component.
 */
export default function SonarrContentRouterPage() {
  const { data, isLoading, isError, error, refetch } = useSonarrInstancesQuery()
  // Placeholder instances are unconfigured - routing to them cannot work
  const instances = (data ?? []).filter(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )
  const { genres, handleGenreDropdownOpen } = useArrGenres()

  // Initialize config for session monitoring support
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize() // Initialize config for session monitoring
      hasInitializedRef.current = true
    }
  }, [configInitialize])

  if (isError) {
    return (
      <PageError
        message={apiErrorMessage(error) ?? 'Failed to load Sonarr instances'}
        onRetry={() => refetch()}
      />
    )
  }

  if (data === undefined || isLoading) {
    return null
  }

  return (
    <div>
      <Tabs defaultValue="content-routes" className="w-full">
        <TabsContent value="content-routes" className="mt-0">
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
