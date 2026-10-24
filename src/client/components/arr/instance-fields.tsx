import { SonarrMonitorNewItemsSchema } from '@root/schemas/sonarr/sonarr-instance.schema'
import { useStore } from '@tanstack/react-form'
import type { ReactNode } from 'react'
import { RoutingFields } from '@/components/routing-fields'
import { BlockTitle } from '@/components/settings/block-title'
import { LockLine } from '@/components/settings/lock-line'
import { FieldSeparator } from '@/components/ui/field'
import type { CreatableOption } from '@/hooks/useCreatableOptions'
import { INSTANCE_COPY } from '@/lib/arr/instance-copy'
import {
  type ArrType,
  editValues,
  MONITOR_NEW_ITEMS_LABELS,
} from '@/lib/arr/instance-form'
import { withFieldGroup } from '@/lib/form'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface InstanceFieldsProps {
  type: ArrType
  isNew: boolean
  disabled: boolean
  connection: ReactNode
  routingNotice: ReactNode
  routingDisabled: boolean
  qualityProfiles: SelectOption[]
  rootFolders: SelectOption[]
  tags: CreatableOption[]
  seasonMonitoringOptions: SelectOption[]
  onCreateTag?: (label: string) => Promise<CreatableOption>
  defaultLock: string | null
  apiKeyError: string | null
  syncOptions: CreatableOption[]
}

const DEFAULT_PROPS: InstanceFieldsProps = {
  type: 'radarr',
  isNew: false,
  disabled: false,
  connection: null,
  routingNotice: null,
  routingDisabled: false,
  qualityProfiles: [],
  rootFolders: [],
  tags: [],
  seasonMonitoringOptions: [],
  defaultLock: null,
  apiKeyError: null,
  syncOptions: [],
}

const MONITOR_NEW_ITEMS_OPTIONS = SonarrMonitorNewItemsSchema.options.map(
  (value) => ({ value, label: MONITOR_NEW_ITEMS_LABELS[value] }),
)

export const InstanceFields = withFieldGroup({
  defaultValues: editValues(null),
  props: DEFAULT_PROPS,
  render: function Render({
    group,
    type,
    isNew,
    disabled,
    connection,
    routingNotice,
    routingDisabled,
    qualityProfiles,
    rootFolders,
    tags,
    seasonMonitoringOptions,
    onCreateTag,
    defaultLock,
    apiKeyError,
    syncOptions,
  }) {
    const isDefault = useStore(group.store, (state) => state.values.isDefault)
    const copy = INSTANCE_COPY[type]
    const defaultOnlyLock = isDefault
      ? null
      : 'Only the default instance uses this.'
    const syncedLock =
      defaultOnlyLock ?? (syncOptions.length === 0 ? copy.syncTargetHint : null)
    const fieldsDisabled = disabled || routingDisabled

    return (
      <>
        <BlockTitle>Connection</BlockTitle>
        <group.AppField name="name">
          {(field) => (
            <field.TextField
              label="Name"
              description="Shown across Pulsarr, for example in the content router."
              placeholder={isNew ? copy.namePlaceholder : undefined}
              disabled={disabled}
            />
          )}
        </group.AppField>
        <group.AppField name="baseUrl">
          {(field) => (
            <field.TextField
              label="URL"
              description="Include the port."
              orientation="vertical"
              type="url"
              placeholder={copy.urlPlaceholder}
              disabled={disabled}
            />
          )}
        </group.AppField>
        <group.AppField name="apiKey">
          {(field) => (
            <field.SecretField
              label="API key"
              description={copy.apiKeyHelp}
              orientation="vertical"
              placeholder={isNew ? 'Paste the API key' : undefined}
              revealLabel={{ show: 'Show API key', hide: 'Hide API key' }}
              error={apiKeyError}
              disabled={disabled}
            />
          )}
        </group.AppField>
        {connection}
        <FieldSeparator />
        <BlockTitle>Where content lands</BlockTitle>
        {routingNotice}
        <RoutingFields
          form={group}
          fields="routing"
          type={type}
          orientation="responsive"
          instanceOptions={[]}
          qualityProfiles={qualityProfiles}
          rootFolders={rootFolders}
          tags={tags}
          seasonMonitoringOptions={seasonMonitoringOptions}
          errorMessage={null}
          instanceDisabled
          fieldsDisabled={fieldsDisabled}
          showMinimumAvailability={type === 'radarr'}
          showInstance={false}
          tagsDescription={copy.tagsDescription}
          onCreateTag={onCreateTag}
        />
        {type === 'sonarr' && (
          <>
            <group.AppField name="monitorNewItems">
              {(field) => (
                <field.SegmentedField
                  label="Monitor new items"
                  description="Whether seasons that air later are monitored."
                  disabled={fieldsDisabled}
                  options={MONITOR_NEW_ITEMS_OPTIONS}
                />
              )}
            </group.AppField>
            <group.AppField name="createSeasonFolders">
              {(field) => (
                <field.SwitchField
                  label="Season folders"
                  description="Put each season in its own folder."
                  disabled={fieldsDisabled}
                />
              )}
            </group.AppField>
          </>
        )}
        <FieldSeparator />
        <BlockTitle>Behavior</BlockTitle>
        {defaultLock && <LockLine reason={defaultLock} />}
        <group.AppField name="isDefault">
          {(field) => (
            <field.SwitchField
              label="Default instance"
              description="Content no route claims goes here. Only one instance can be the default."
              disabled={disabled || defaultLock !== null}
            />
          )}
        </group.AppField>
        <group.AppField name="bypassIgnored">
          {(field) => (
            <field.SwitchField
              label="Bypass ignored"
              description="Add content even when it is on this instance's import list exclusions."
              disabled={disabled}
            />
          )}
        </group.AppField>
        {syncedLock && <LockLine reason={syncedLock} />}
        <group.AppField name="syncedInstances">
          {(field) => (
            <field.TagsField
              label="Synced instances"
              description="These also receive everything that reaches this instance, for example a 4K copy."
              placeholder="Add an instance"
              emptyText="No more instances"
              disabled={disabled || syncedLock !== null}
              options={syncOptions}
            />
          )}
        </group.AppField>
        <group.AppField name="skipDefaultRoutingWhenNoMatch">
          {(field) => (
            <field.SwitchField
              label="Skip content no route matches"
              description="When off, content that matches no route falls back to this instance. When on, it's skipped."
              disabled={disabled || defaultOnlyLock !== null}
            />
          )}
        </group.AppField>
      </>
    )
  },
})
