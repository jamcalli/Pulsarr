import { useEffect, useRef } from 'react'
import { useConfig } from '@/hooks/useConfig'
import { PageError } from '@/legacy/components/page-error'
import { Tabs, TabsContent } from '@/legacy/components/ui/tabs'
import AccordionContentRouterSection from '@/legacy/features/library/components/content-router/accordion-content-router-section'
import { useArrGenres } from '@/legacy/features/library/hooks/instances/useArrGenres'
import { useSonarrInstancesQuery } from '@/legacy/hooks/arr/useSonarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/legacy/lib/arr/sonarr-constants'
import { apiErrorMessage } from '@/lib/tanstackApi'

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
  const { initialize: configInitialize } = useConfig()

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize() // Initialize config for session monitoring
      hasInitializedRef.current = true
    }
  }, [configInitialize])

  if (isError && data === undefined) {
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
