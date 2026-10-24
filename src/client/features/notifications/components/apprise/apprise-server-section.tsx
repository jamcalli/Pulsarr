import type { AppriseStatus } from '@root/types/notification.types'
import { TriangleAlert } from 'lucide-react'
import { ExternalLink } from '@/components/external-link'
import { FactList } from '@/components/fact-list'
import { InlineCode } from '@/components/inline-code'
import { InfoLine } from '@/components/settings/info-line'
import { SettingsSection } from '@/components/settings/settings-section'
import {
  APPRISE_DOCS_URL,
  APPRISE_URL_FORMATS_URL,
} from '@/features/notifications/lib/apprise'

const setupLink = (
  <ExternalLink href={APPRISE_DOCS_URL}>Apprise setup</ExternalLink>
)

export function AppriseServerSection({
  status,
  serverUrl,
}: {
  status: AppriseStatus
  serverUrl: string
}) {
  return (
    <SettingsSection
      title="Apprise server"
      description="Where Pulsarr hands off notifications for delivery."
    >
      <FactList
        facts={[
          { label: 'Server URL', value: serverUrl || 'Not set' },
          { label: 'Set by', value: 'Environment, read at startup' },
        ]}
      />
      {status === 'enabled' && (
        <InfoLine
          action={
            <ExternalLink href={APPRISE_URL_FORMATS_URL}>
              Apprise URL formats
            </ExternalLink>
          }
        >
          Pulsarr sends to the stateless notify endpoint, so list full Apprise
          URLs or a saved config as{' '}
          <InlineCode>apprise://host:8000/key</InlineCode>.
        </InfoLine>
      )}
      {status === 'disabled' && (
        <InfoLine icon={TriangleAlert} tone="warn" action={setupLink}>
          Pulsarr couldn't reach this server at startup. Restart Pulsarr once
          it's running.
        </InfoLine>
      )}
      {status === 'not_configured' && (
        <InfoLine action={setupLink}>
          Set <InlineCode>appriseUrl</InlineCode> in the environment, then
          restart Pulsarr.
        </InfoLine>
      )}
    </SettingsSection>
  )
}
