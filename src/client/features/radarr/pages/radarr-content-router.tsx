import { useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { useArrGenres } from '@/features/arr/useArrGenres'
import { useRadarrInstancesQuery } from '@/features/radarr/hooks/instance/useRadarrInstanceQueries'
import { useConfigStore } from '@/stores/configStore'

/**
 * Renders the Radarr Content Router configuration page for managing content routing rules.
 *
 * @returns The React component for the Radarr Content Router page.
 */
export default function RadarrContentRouterPage() {
  const { data, isLoading } = useRadarrInstancesQuery()
  const instances = data ?? []
  const { genres, handleGenreDropdownOpen } = useArrGenres()

  // Route cards read session-monitoring config, so it must be initialized here
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize()
      hasInitializedRef.current = true
    }
  }, [configInitialize])

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
