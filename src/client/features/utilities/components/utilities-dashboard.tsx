import { DeleteSyncForm } from '@/features/utilities/components/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync-skeleton'
import { useDeleteSync } from '@/features/utilities/hooks/useDeleteSync'

export function UtilitiesDashboard() {
  const { isLoading } = useDeleteSync()

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-6 text-2xl font-bold text-text">Utilities</h2>

      <div className="space-y-6">
        {isLoading ? <DeleteSyncSkeleton /> : <DeleteSyncForm />}
      </div>
    </div>
  )
}
