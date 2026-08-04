import { useEffect, useRef } from 'react'
import { PageError } from '@/components/ui/page-error'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useArrGenres } from '@/features/arr/useArrGenres'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { useRadarrInstancesQuery } from '@/features/radarr/hooks/instance/useRadarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { useConfig } from '@/hooks/useConfig'
import { apiErrorMessage } from '@/lib/tanstackApi'

/**
 * Renders the Radarr Content Router configuration page for managing content routing rules.
 *
 * @returns The React component for the Radarr Content Router page.
 */
export default function RadarrContentRouterPage() {
  const { data, isLoading, isError, error, refetch } = useRadarrInstancesQuery()
  // Placeholder instances are unconfigured - routing to them cannot work
  const instances = (data ?? []).filter(
    (instance) => instance.apiKey !== API_KEY_PLACEHOLDER,
  )
  const { genres, handleGenreDropdownOpen } = useArrGenres()

  // Route cards read session-monitoring config, so it must be initialized here
  const { initialize: configInitialize } = useConfig()

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize()
      hasInitializedRef.current = true
    }
  }, [configInitialize])

  if (isError) {
    return (
      <PageError
        message={apiErrorMessage(error) ?? 'Failed to load Radarr instances'}
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
