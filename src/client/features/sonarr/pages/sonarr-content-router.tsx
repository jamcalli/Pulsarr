import { useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useArrGenres } from '@/features/arr/useArrGenres'
import AccordionContentRouterSection from '@/features/content-router/components/accordion-content-router-section'
import { useSonarrInstancesQuery } from '@/features/sonarr/hooks/instance/useSonarrInstanceQueries'
import { useConfigStore } from '@/stores/configStore'

/**
 * Displays the Sonarr Content Router page for managing content routing rules.
 *
 * @returns The Sonarr Content Router page component.
 */
export default function SonarrContentRouterPage() {
  const { data, isLoading } = useSonarrInstancesQuery()
  const instances = data ?? []
  const { genres, handleGenreDropdownOpen } = useArrGenres()

  // Add config store initialization for session monitoring support
  const configInitialize = useConfigStore((state) => state.initialize)

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      configInitialize() // Initialize config store for session monitoring
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
