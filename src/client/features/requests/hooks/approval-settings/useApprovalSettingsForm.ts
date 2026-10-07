import { ApprovalSettingsFormSchema } from '@/features/requests/lib/approval-settings-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import { useSaveForm } from '@/hooks/useSaveForm'
import {
  getScheduleSnapshot,
  type ScheduleStatus,
  updateSchedule,
} from '@/hooks/useSchedule'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

type ApprovalSettingsValues = Pick<
  Config,
  'approvalNotify' | 'approvalExpiration'
>

interface ScheduleValues {
  enabled: boolean
  expression: string
}

function toConfigValues(config: Config): ApprovalSettingsValues {
  return {
    approvalNotify: config.approvalNotify,
    approvalExpiration: config.approvalExpiration,
  }
}

function toScheduleValues(schedule: ScheduleStatus): ScheduleValues {
  return {
    enabled: schedule.enabled,
    expression: schedule.type === 'cron' ? schedule.config.expression : '',
  }
}

export function useApprovalSettingsForm(
  config: Config,
  schedule: ScheduleStatus,
) {
  const configForm = useConfigForm({
    config,
    toValues: toConfigValues,
    schema: ApprovalSettingsFormSchema,
  })

  const scheduleForm = useSaveForm({
    source: schedule,
    toValues: toScheduleValues,
    save: (values: ScheduleValues) => updateSchedule(schedule.name, values),
    latest: () => getScheduleSnapshot(schedule.name),
    saveErrorFallback: 'The schedule was not saved. Save again to retry.',
  })
  const dirty = configForm.dirty || scheduleForm.dirty

  return {
    configForm: configForm.form,
    scheduleForm: scheduleForm.form,
    dirty,
    saving: configForm.saving || scheduleForm.saving,
    saved: (configForm.saved || scheduleForm.saved) && !dirty,
    errorMessage: configForm.errorMessage ?? scheduleForm.errorMessage,
    discard: () => {
      configForm.discard()
      scheduleForm.discard()
    },
    submit: () => {
      if (configForm.dirty) configForm.form.handleSubmit()
      if (scheduleForm.dirty && !scheduleForm.form.state.isSubmitting) {
        scheduleForm.form.handleSubmit()
      }
    },
  }
}
