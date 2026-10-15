import { useStore } from '@tanstack/react-form'
import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { ErrorAlert } from '@/components/error-alert'
import {
  FieldRowSkeleton,
  SettingsSectionSkeleton,
} from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ServerSettings } from '@/features/system/hooks/plex-connection/useServerSettings'
import { LINK_FIRST_REASON } from '@/features/system/lib/plex-connection/account-facts'
import {
  CONNECTION_HELP,
  CONNECTION_OPTIONS,
  connectionTestView,
  connectionUrl,
  type ServerFormValues,
} from '@/features/system/lib/plex-connection/server-address'
import { withFieldGroup } from '@/lib/form'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'
import type { components } from '@/types/api.js'

const DEFAULT_VALUES: ServerFormValues = {
  connection: 'auto',
  address: '',
  skipIfExistsOnPlex: false,
}

interface ServerCardProps {
  linkedToken: string | null
  dirty: boolean
  discovery: ServerSettings['discovery'] | null
  test: ServerSettings['test'] | null
}

const DEFAULT_PROPS: ServerCardProps = {
  linkedToken: null,
  dirty: false,
  discovery: null,
  test: null,
}

function serverOption(server: components['schemas']['PlexServer']) {
  const url = connectionUrl(server)
  return {
    value: url,
    label: server.name,
    description: (
      <span className="flex flex-col gap-1.5">
        <span>{url}</span>
        {server.description && <span>{server.description}</span>}
        {!server.success && <span>{server.message}</span>}
        <span className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{server.local ? 'Local' : 'Remote'}</Badge>
          <Badge variant="outline">{server.useSsl ? 'SSL' : 'No SSL'}</Badge>
          {!server.success && (
            <Badge variant="destructive">Couldn't connect</Badge>
          )}
        </span>
      </span>
    ),
  }
}

export const ServerCard = withFieldGroup({
  defaultValues: DEFAULT_VALUES,
  props: DEFAULT_PROPS,
  render: function Render({ group, linkedToken, dirty, discovery, test }) {
    const connection = useStore(group.store, (state) => state.values.connection)
    const locked = linkedToken === null
    const servers = discovery?.servers ?? null
    const testView = connectionTestView({
      running: test?.running ?? false,
      errorMessage: test?.errorMessage ?? null,
      result: test?.result?.data ?? null,
    })

    return (
      <SettingsSection
        title="Plex server"
        description="Used for sessions, labels, playlists and existence checks."
        lock={locked ? { reason: LINK_FIRST_REASON } : undefined}
      >
        <group.AppField name="connection">
          {(field) => (
            <field.SegmentedField
              label="Connection"
              description={CONNECTION_HELP[connection]}
              options={CONNECTION_OPTIONS}
              disabled={locked}
            />
          )}
        </group.AppField>
        {connection === 'address' && (
          <div className="flex flex-col gap-4">
            <group.AppField name="address">
              {(field) => (
                <field.TextField
                  label="Server address"
                  description="Type an address, or pick one Plex offers."
                  type="url"
                  autoComplete="off"
                  placeholder="https://192.168.1.100:32400"
                  disabled={locked}
                  action={
                    <Button
                      type="button"
                      variant="neutral"
                      disabled={locked || discovery?.finding}
                      onClick={() =>
                        linkedToken && discovery?.find(linkedToken)
                      }
                    >
                      <BusyLabel
                        busy={discovery?.finding ?? false}
                        label="Find server"
                        busyLabel="Finding..."
                      />
                    </Button>
                  }
                />
              )}
            </group.AppField>
            <ErrorAlert message={discovery?.errorMessage ?? null} />
            {servers && servers.length === 0 && (
              <ErrorAlert message="Plex found no servers for this account." />
            )}
            {servers && servers.length > 0 && (
              <group.AppField name="address">
                {(field) => (
                  <field.RadioField
                    label="Connections Plex offers"
                    options={servers.map(serverOption)}
                    disabled={locked}
                  />
                )}
              </group.AppField>
            )}
          </div>
        )}
        <ConnectionTest
          status={testView.status}
          failure={testView.failure}
          passedDetail={testView.passedDetail}
          disabled={locked || dirty}
          disabledReason={!locked && dirty ? UNSAVED_CHANGES_REASON : null}
          onTest={() => test?.run()}
        />
        <group.AppField name="skipIfExistsOnPlex">
          {(field) => (
            <field.SwitchField
              label="Skip content already on Plex"
              description="Skip requests your server or shared servers already have."
              disabled={locked}
            />
          )}
        </group.AppField>
      </SettingsSection>
    )
  },
})

export function ServerCardSkeleton() {
  return (
    <SettingsSectionSkeleton>
      <FieldRowSkeleton control="field" />
      <FieldRowSkeleton control="field" />
      <FieldRowSkeleton control="switch" />
    </SettingsSectionSkeleton>
  )
}
