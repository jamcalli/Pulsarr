import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { InlineCode } from '@/components/inline-code'
import {
  type SettingsLock,
  SettingsSection,
} from '@/components/settings/settings-section'
import { AliasReadinessCredenza } from '@/features/users/components/alias-readiness-credenza'
import { withFieldGroup } from '@/lib/form'
import {
  SAMPLE_USER_NAMES,
  USER_NAMING_SOURCE_OPTIONS,
} from '@/lib/user-naming'
import type { components } from '@/types/api.js'

const DEFAULT_VALUES: {
  prefix: string
  namingSource: components['schemas']['UserNamingSource']
} = { prefix: '', namingSource: 'username' }

const DEFAULT_PROPS: {
  title: string
  noun: string
  separator: string
  placeholder: string
  disabled: boolean
  lock?: SettingsLock
} = { title: '', noun: '', separator: '', placeholder: '', disabled: false }

/** Switching the source to alias asks for confirmation before it changes the field. */
export const NamingFormatSection = withFieldGroup({
  defaultValues: DEFAULT_VALUES,
  props: DEFAULT_PROPS,
  render: function Render({
    group,
    title,
    noun,
    separator,
    placeholder,
    disabled,
    lock,
  }) {
    const [aliasOpen, setAliasOpen] = useState(false)
    const namingSource = useStore(
      group.store,
      (state) => state.values.namingSource,
    )

    return (
      <>
        <SettingsSection title={title} lock={lock}>
          <group.AppField name="prefix">
            {(field) => (
              <field.TextField
                label="Prefix"
                type="text"
                placeholder={placeholder}
                disabled={disabled}
                preview={(prefix) => (
                  <>
                    {noun} look like{' '}
                    <InlineCode>
                      {`${prefix || placeholder}${separator}${SAMPLE_USER_NAMES[namingSource]}`}
                    </InlineCode>
                  </>
                )}
              />
            )}
          </group.AppField>
          <group.AppField name="namingSource">
            {(field) => (
              <field.SegmentedField
                label="Name from"
                description="Users without an alias fall back to their Plex username."
                options={USER_NAMING_SOURCE_OPTIONS}
                disabled={disabled}
                onBeforeChange={(next) => {
                  if (next !== 'alias') return true
                  setAliasOpen(true)
                  return false
                }}
              />
            )}
          </group.AppField>
        </SettingsSection>
        <AliasReadinessCredenza
          open={aliasOpen}
          onOpenChange={setAliasOpen}
          onConfirm={() => {
            group.setFieldValue('namingSource', 'alias')
            setAliasOpen(false)
          }}
        />
      </>
    )
  },
})
