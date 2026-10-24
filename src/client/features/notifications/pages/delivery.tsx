import { useStore } from '@tanstack/react-form'
import { ConfigPageGate } from '@/components/config-page-gate'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { useDeliveryForm } from '@/features/notifications/hooks/delivery/useDeliveryForm'
import {
  availabilityHelp,
  newEpisodeThresholdHelp,
  queueWaitHelp,
} from '@/features/notifications/lib/delivery-copy'
import { DELIVERY_SKELETON } from '@/features/notifications/lib/delivery-skeleton'
import {
  NEW_EPISODE_THRESHOLD_HOURS,
  QUEUE_WAIT_MINUTES,
} from '@/features/notifications/lib/delivery-units'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import {
  notifyOptions,
  UPDATE_NOTIFY_SELECT_OPTIONS,
} from '@/lib/notify-labels'
import type { components } from '@/types/api.js'

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.delivery.label
const DESCRIPTION = 'Grouping, admin notices and user alerts.'

function DeliverySettings({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useDeliveryForm(config)
  const guard = useLeaveGuard(dirty)
  const queueWait = useStore(
    form.store,
    (state) => state.values.queueWaitMinutes,
  )
  const threshold = useStore(
    form.store,
    (state) => state.values.newEpisodeThresholdHours,
  )
  const availabilityOn = useStore(
    form.store,
    (state) => state.values.notifyOnAvailability,
  )

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection
            title="Episode grouping"
            description="How Pulsarr bundles episodes into fewer notifications."
          >
            <form.AppField name="queueWaitMinutes">
              {(field) => (
                <field.NumberField
                  label="Queue wait time"
                  description={queueWaitHelp(queueWait)}
                  unit="minute"
                  min={QUEUE_WAIT_MINUTES.min}
                  max={QUEUE_WAIT_MINUTES.max}
                />
              )}
            </form.AppField>
            <form.AppField name="newEpisodeThresholdHours">
              {(field) => (
                <field.NumberField
                  label="New episode threshold"
                  description={newEpisodeThresholdHelp(threshold)}
                  unit="hour"
                  min={NEW_EPISODE_THRESHOLD_HOURS.min}
                  max={NEW_EPISODE_THRESHOLD_HOURS.max}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SettingsSection
            title="Admin notifications"
            description="Where notices about Pulsarr itself and your users' activity go."
          >
            <form.AppField name="notifyOnUpdate">
              {(field) => (
                <field.SelectField
                  label="Update notifications"
                  description="Where notices about a new Pulsarr release go."
                  options={UPDATE_NOTIFY_SELECT_OPTIONS}
                />
              )}
            </form.AppField>
            <form.AppField name="watchlistAddNotify">
              {(field) => (
                <field.SelectField
                  label="Watchlist additions"
                  description="How you hear that a user added something."
                  options={notifyOptions(config.watchlistAddNotify)}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SettingsSection
            title="User notifications"
            description="Whether users are told when their content is ready."
          >
            <form.AppField name="notifyOnAvailability">
              {(field) => (
                <field.SwitchField
                  label="Availability notifications"
                  description={availabilityHelp(availabilityOn)}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </form.Form>
      </form.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function DeliveryPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...DELIVERY_SKELETON} />}
    >
      {(config) => <DeliverySettings config={config} />}
    </ConfigPageGate>
  )
}
