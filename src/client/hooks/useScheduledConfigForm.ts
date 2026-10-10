import type { StandardSchemaV1 } from '@tanstack/react-form'
import { useConfigForm } from '@/hooks/useConfigForm'
import { useSaveForm } from '@/hooks/useSaveForm'
import {
  getScheduleSnapshot,
  type ScheduleStatus,
  updateSchedule,
} from '@/hooks/useSchedule'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface ScheduleValues {
  enabled: boolean
  expression: string
}

interface ScheduledConfigFormOptions<Values extends ConfigUpdate> {
  config: Config
  toValues: (config: Config) => Values
  schema: StandardSchemaV1<Values>
  schedule: ScheduleStatus
}

function toScheduleValues(schedule: ScheduleStatus): ScheduleValues {
  return {
    enabled: schedule.enabled,
    expression: schedule.type === 'cron' ? schedule.config.expression : '',
  }
}

/** One save for a config slice and its job's cron schedule, each write resetting only its own fields. */
export function useScheduledConfigForm<Values extends ConfigUpdate>({
  config,
  toValues,
  schema,
  schedule,
}: ScheduledConfigFormOptions<Values>) {
  const configForm = useConfigForm({ config, toValues, schema })

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
