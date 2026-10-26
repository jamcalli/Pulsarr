import { DeleteSyncFormSchema } from '@/features/library/lib/delete-sync/delete-sync-form.schema'
import { deleteSyncValues } from '@/features/library/lib/delete-sync/delete-sync-settings'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { useScheduledConfigForm } from '@/hooks/useScheduledConfigForm'
import type { components } from '@/types/api.js'

export function useDeleteSyncForm(
  config: components['schemas']['Config'],
  schedule: ScheduleStatus,
) {
  return useScheduledConfigForm({
    config,
    schedule,
    toValues: deleteSyncValues,
    schema: DeleteSyncFormSchema,
  })
}
