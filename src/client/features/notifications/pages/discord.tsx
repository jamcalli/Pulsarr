import { useStore } from '@tanstack/react-form'
import { TriangleAlert } from 'lucide-react'
import { ConfigPageGate } from '@/components/config-page-gate'
import { ExternalLink } from '@/components/external-link'
import { InlineCode } from '@/components/inline-code'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { InfoLine } from '@/components/settings/info-line'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { BotControl } from '@/features/notifications/components/discord/bot-control'
import { TestDirectMessage } from '@/features/notifications/components/discord/test-direct-message'
import { useDiscordForm } from '@/features/notifications/hooks/discord/useDiscordForm'
import {
  botRestartNeeded,
  DISCORD_DOCS_URL,
} from '@/features/notifications/lib/discord-bot'
import { DISCORD_SKELETON } from '@/features/notifications/lib/discord-skeleton'
import { useDiscordBotStatus } from '@/hooks/useDiscordBotStatus'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import { testDiscordWebhook, testSystemTarget } from '@/lib/notification-tests'
import { discordWebhookRowError, firstRowError } from '@/lib/notification-urls'
import type { components } from '@/types/api.js'

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.discord.label
const DESCRIPTION = 'Admin channels and the bot that messages users.'

function DiscordSettings({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useDiscordForm(config)
  const guard = useLeaveGuard(dirty)
  const status = useDiscordBotStatus()
  const saveError = useStore(form.store, (state) =>
    firstRowError(state.values.discordWebhookUrl, discordWebhookRowError),
  )
  const credentialsDirty = useStore(
    form.store,
    (state) =>
      state.values.discordBotToken !== (config.discordBotToken ?? '') ||
      state.values.discordClientId !== (config.discordClientId ?? ''),
  )

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection
            title="Admin webhooks"
            description="Discord channels that get Pulsarr's system notifications."
          >
            <form.AppField name="discordWebhookUrl">
              {(field) => (
                <field.UrlListField
                  label="Webhook URLs"
                  description="Each URL posts system notifications to one Discord channel."
                  placeholder="https://discord.com/api/webhooks/..."
                  saved={config.discordWebhookUrl ?? ''}
                  validateRow={discordWebhookRowError}
                  testUrl={testDiscordWebhook}
                  testSaved={() => testSystemTarget('adminWebhook')}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SettingsSection
            title="Discord bot"
            description="Sends direct messages to users who saved a Discord ID."
            action={<BotControl config={config} />}
          >
            <form.AppField name="discordBotToken">
              {(field) => (
                <field.SecretField
                  label="Bot token"
                  description="From the Bot page of your Discord application."
                  orientation="vertical"
                  revealLabel={{ show: 'Show token', hide: 'Hide token' }}
                />
              )}
            </form.AppField>
            <form.AppField name="discordClientId">
              {(field) => (
                <field.TextField
                  label="Client ID"
                  description="Your Discord application's ID, from its General page."
                  autoComplete="off"
                />
              )}
            </form.AppField>
            {botRestartNeeded(status, credentialsDirty) && (
              <Alert variant="warn">
                <TriangleAlert />
                <AlertTitle>
                  The running bot keeps its old token until you restart it.
                </AlertTitle>
              </Alert>
            )}
            <TestDirectMessage />
            <InfoLine
              action={
                <ExternalLink href={DISCORD_DOCS_URL}>
                  Discord setup
                </ExternalLink>
              }
            >
              Add your own Discord user ID on your user page, then have your
              users run <InlineCode>/notifications</InlineCode> in your server.
            </InfoLine>
          </SettingsSection>
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

export default function DiscordPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...DISCORD_SKELETON} />}
    >
      {(config) => <DiscordSettings config={config} />}
    </ConfigPageGate>
  )
}
