import { useState, useEffect } from 'react'
import { DeleteSyncForm } from '@/features/utilities/components/delete-sync/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-skeleton'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Renders a utilities dashboard that conditionally displays a loading skeleton or a delete sync form.
 *
 * This component manages a smooth transition from a loading state to the fully rendered UI. It monitors the global schedule loading state and, when schedules have loaded, applies a 100ms delay before removing the local loading state to prevent UI flickering.
 *
 * @returns A React element representing the utilities dashboard.
 */
export function UtilitiesDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const loading = useUtilitiesStore((state) => state.loading)
  const hasLoadedSchedules = useUtilitiesStore(
    (state) => state.hasLoadedSchedules,
  )

  // Manage loading state to prevent flickering
  useEffect(() => {
    if (hasLoadedSchedules) {
      // Add a small delay to ensure smooth transitions
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [hasLoadedSchedules])

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-6 text-2xl font-bold text-text">Utilities</h2>

      <div className="space-y-6">
        {isLoading || loading.schedules ? (
          <DeleteSyncSkeleton />
        ) : (
          <DeleteSyncForm />
        )}
      </div>
    </div>
  )
}
