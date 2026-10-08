import {
  MINIMUM_AVAILABILITY_LABELS,
  RADARR_MONITOR_LABELS,
} from '@root/schemas/radarr/add-options.schema'
import type { ComponentProps } from 'react'
import { ErrorAlert } from '@/components/error-alert'
import type { FieldRow } from '@/components/form/field-row'
import type { CreatableOption } from '@/hooks/useCreatableOptions'
import type { ArrTarget } from '@/lib/approval'
import type { RoutingFormValues } from '@/lib/approval-routing-form'
import { SERIES_TYPE_LABELS } from '@/lib/arr-labels'
import { withFieldGroup } from '@/lib/form'

/** Null on an instance-scoped field means use the instance's value at routing time. */
export type RoutingFieldValues = Omit<
  RoutingFormValues,
  'syncedInstances' | 'minimumAvailability' | 'qualityProfile' | 'rootFolder'
> &
  Partial<Pick<RoutingFormValues, 'minimumAvailability'>> & {
    qualityProfile: string | null
    rootFolder: string | null
  }

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

const INHERIT_LABEL = 'Use instance default'

function withInherit<T extends string | boolean>(
  inherit: boolean,
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>,
): Array<{ value: T | null; label: string; disabled?: boolean }> {
  return inherit
    ? [{ value: null, label: INHERIT_LABEL }, ...options]
    : [...options]
}

const SEARCH_ON_ADD_OPTIONS = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
]

interface RoutingFieldsProps {
  type: ArrTarget['type']
  orientation: ComponentProps<typeof FieldRow>['orientation']
  instanceOptions: SelectOption[]
  qualityProfiles: SelectOption[]
  rootFolders: SelectOption[]
  tags: CreatableOption[]
  seasonMonitoringOptions: SelectOption[]
  errorMessage: string | null
  instanceDisabled: boolean
  fieldsDisabled: boolean
  showMinimumAvailability: boolean
  /** Offers "Use instance default" on every instance-scoped field except tags, stored as null. */
  inherit?: boolean
  onCreateTag: (label: string) => Promise<CreatableOption>
  onInstanceChange: (instanceId: string) => void
}

const DEFAULT_PROPS: RoutingFieldsProps = {
  type: 'radarr',
  orientation: 'vertical',
  instanceOptions: [],
  qualityProfiles: [],
  rootFolders: [],
  tags: [],
  seasonMonitoringOptions: [],
  errorMessage: null,
  instanceDisabled: false,
  fieldsDisabled: false,
  showMinimumAvailability: false,
  onCreateTag: () => Promise.reject(new Error('Tags cannot be created here.')),
  onInstanceChange: () => undefined,
}

function labelOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

const DEFAULT_VALUES: RoutingFieldValues = {
  instanceId: '',
  qualityProfile: '',
  rootFolder: '',
  tags: [],
  searchOnAdd: true,
  seasonMonitoring: 'all',
  seriesType: 'standard',
  monitor: 'movieOnly',
}

export const RoutingFields = withFieldGroup({
  defaultValues: DEFAULT_VALUES,
  props: DEFAULT_PROPS,
  render: function Render({
    group,
    type,
    orientation,
    instanceOptions,
    qualityProfiles,
    rootFolders,
    tags,
    seasonMonitoringOptions,
    errorMessage,
    instanceDisabled,
    fieldsDisabled,
    showMinimumAvailability,
    inherit = false,
    onCreateTag,
    onInstanceChange,
  }) {
    const arrFields =
      type === 'sonarr' ? (
        <>
          <group.AppField name="seasonMonitoring">
            {(field) => (
              <field.SelectField
                label="Season monitoring"
                orientation={orientation}
                disabled={fieldsDisabled}
                options={withInherit(inherit, seasonMonitoringOptions)}
              />
            )}
          </group.AppField>
          <group.AppField name="seriesType">
            {(field) => (
              <field.SegmentedField
                label="Series type"
                orientation={orientation}
                disabled={fieldsDisabled}
                options={withInherit(inherit, labelOptions(SERIES_TYPE_LABELS))}
              />
            )}
          </group.AppField>
        </>
      ) : (
        <>
          {showMinimumAvailability && (
            <group.AppField name="minimumAvailability">
              {(field) => (
                <field.SegmentedField
                  label="Minimum availability"
                  orientation={orientation}
                  disabled={fieldsDisabled}
                  options={labelOptions(MINIMUM_AVAILABILITY_LABELS)}
                />
              )}
            </group.AppField>
          )}
          <group.AppField name="monitor">
            {(field) => (
              <field.SelectField
                label="Monitor"
                orientation={orientation}
                disabled={fieldsDisabled}
                options={withInherit(
                  inherit,
                  labelOptions(RADARR_MONITOR_LABELS),
                )}
              />
            )}
          </group.AppField>
        </>
      )

    return (
      <>
        <group.AppField
          name="instanceId"
          listeners={{ onChange: ({ value }) => onInstanceChange(value) }}
        >
          {(field) => (
            <field.SelectField
              label="Instance"
              description="Switching instance resets the fields below to its defaults."
              orientation={orientation}
              disabled={instanceDisabled}
              options={instanceOptions}
            />
          )}
        </group.AppField>
        <ErrorAlert message={errorMessage} />
        <group.AppField name="qualityProfile">
          {(field) => (
            <field.SelectField
              label="Quality profile"
              orientation={orientation}
              disabled={fieldsDisabled}
              options={withInherit(inherit, qualityProfiles)}
            />
          )}
        </group.AppField>
        <group.AppField name="rootFolder">
          {(field) => (
            <field.SelectField
              label="Root folder"
              orientation={orientation}
              disabled={fieldsDisabled}
              options={withInherit(inherit, rootFolders)}
            />
          )}
        </group.AppField>
        {arrFields}
        <group.AppField name="searchOnAdd">
          {(field) =>
            inherit ? (
              <field.SegmentedField
                label="Search on add"
                orientation={orientation}
                disabled={fieldsDisabled}
                options={withInherit(inherit, SEARCH_ON_ADD_OPTIONS)}
              />
            ) : (
              <field.SwitchField
                label="Search on add"
                description={
                  field.state.value
                    ? 'Search as soon as it is added'
                    : 'Add without searching'
                }
                disabled={fieldsDisabled}
              />
            )
          }
        </group.AppField>
        <group.AppField name="tags">
          {(field) => (
            <field.TagsField
              label="Tags"
              orientation={orientation}
              disabled={fieldsDisabled}
              description="Leave empty to apply the instance's tags. Listed tags replace them."
              emptyText="No tags on this instance"
              options={tags}
              onCreate={onCreateTag}
            />
          )}
        </group.AppField>
      </>
    )
  },
})
