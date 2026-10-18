import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { ConfigPageGate } from '@/components/config-page-gate'
import { LeaveDialog } from '@/components/leave-dialog'
import { NavPageButton } from '@/components/nav-page-button'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import {
  type SettingsLock,
  SettingsSection,
} from '@/components/settings/settings-section'
import { StatusPill, type StatusPillView } from '@/components/status-pill'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PublicContentSkeleton } from '@/features/notifications/components/public-content/public-content-skeleton'
import { usePublicContentForm } from '@/features/notifications/hooks/public-content/usePublicContentForm'
import {
  APPRISE_STATUS_PILLS,
  appriseLockReason,
  appriseStatusFromConfig,
} from '@/features/notifications/lib/apprise'
import {
  channelUrlCount,
  overrideNote,
  PUBLIC_APPRISE,
  PUBLIC_CONTENT_OFF_REASON,
  PUBLIC_CONTENT_TABS,
  PUBLIC_DISCORD,
  type PublicChannel,
  type PublicContentTab,
  publicContentSaveError,
  savedUrlCount,
  savedUrlsPill,
} from '@/features/notifications/lib/public-content'
import { useAppriseStatus } from '@/hooks/useAppriseStatus'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { formatNumber } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'
import { testSystemTarget } from '@/lib/notification-tests'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.publicContent.label
const DESCRIPTION =
  'Announce every ready title in shared Discord channels and Apprise targets.'

const OFF_LOCK: SettingsLock = { reason: PUBLIC_CONTENT_OFF_REASON }

function PublicContentSettings({ config }: { config: Config }) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    usePublicContentForm(config)
  const guard = useLeaveGuard(dirty)
  const enabled = useStore(form.store, (state) => state.values.enabled)
  const [activeTab, setActiveTab] = useState<PublicContentTab>('all')
  const appriseStatus = useAppriseStatus() ?? appriseStatusFromConfig(config)
  const appriseReason = appriseLockReason(appriseStatus, 'lists')
  const discordLock = enabled ? undefined : OFF_LOCK
  const appriseLock: SettingsLock | undefined = !enabled
    ? OFF_LOCK
    : appriseReason
      ? {
          reason: appriseReason,
          action: <NavPageButton page={NAV_PAGES.apprise} />,
        }
      : undefined
  const lockedChannels = [
    ...(discordLock ? [PUBLIC_DISCORD] : []),
    ...(appriseLock ? [PUBLIC_APPRISE] : []),
  ]
  const saveError = useStore(form.store, (state) =>
    publicContentSaveError(state.values, activeTab, lockedChannels),
  )
  const savedLists = config.publicContentNotifications

  const channelSection = (
    channel: PublicChannel,
    tab: PublicContentTab,
    pill: StatusPillView,
    lock?: SettingsLock,
    description?: string,
  ) => {
    const list = channel.lists[tab]
    return (
      <SettingsSection
        title={channel.title}
        description={description}
        action={<StatusPill {...pill} live />}
        lock={lock}
      >
        <form.AppField name={list.name}>
          {(field) => (
            <field.UrlListField
              label={channel.listLabel}
              placeholder={channel.placeholder}
              masked={channel.masked}
              disabled={lock !== undefined}
              saved={savedLists[list.name]}
              validateRow={channel.validateRow}
              testUrl={channel.testUrl}
              testSaved={() => testSystemTarget(list.target)}
            />
          )}
        </form.AppField>
      </SettingsSection>
    )
  }

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection title="Broadcast">
            <form.AppField name="enabled">
              {(field) => (
                <field.SwitchField
                  label="Broadcast to shared channels"
                  description="Lists on every tab get the same announcement."
                />
              )}
            </form.AppField>
          </SettingsSection>
          <Tabs
            value={activeTab}
            onValueChange={(next) => {
              const match = PUBLIC_CONTENT_TABS.find(
                ({ value }) => value === next,
              )
              if (match) setActiveTab(match.value)
            }}
            className="gap-5"
          >
            <TabsList aria-label="Content type">
              {PUBLIC_CONTENT_TABS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                  <Badge variant="secondary">
                    {formatNumber(savedUrlCount(savedLists, option.value))}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {PUBLIC_CONTENT_TABS.map((option) => (
              <TabsContent key={option.value} value={option.value} keepMounted>
                <div className="flex flex-col gap-5">
                  {channelSection(
                    PUBLIC_DISCORD,
                    option.value,
                    savedUrlsPill(
                      channelUrlCount(savedLists, PUBLIC_DISCORD, option.value),
                    ),
                    discordLock,
                    option.value === 'all'
                      ? undefined
                      : overrideNote(option.label),
                  )}
                  {channelSection(
                    PUBLIC_APPRISE,
                    option.value,
                    APPRISE_STATUS_PILLS[appriseStatus],
                    appriseLock,
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            message={saveError ?? undefined}
            saveDisabled={saveError !== null}
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

export default function PublicContentPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<PublicContentSkeleton />}
    >
      {(config) => <PublicContentSettings config={config} />}
    </ConfigPageGate>
  )
}
