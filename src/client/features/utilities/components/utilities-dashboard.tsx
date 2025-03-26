import { useState, useEffect } from 'react'
import { DeleteSyncForm } from '@/features/utilities/components/delete-sync/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-skeleton'
import { DeleteSyncResults } from '@/features/utilities/components/delete-sync/delete-sync-results'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

export function UtilitiesDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const loading = useUtilitiesStore(state => state.loading)
  const hasLoadedSchedules = useUtilitiesStore(state => state.hasLoadedSchedules)
  
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
        {isLoading || loading.schedules ? <DeleteSyncSkeleton /> : <DeleteSyncForm />}
        <DeleteSyncResults />
      </div>
    </div>
  )
}