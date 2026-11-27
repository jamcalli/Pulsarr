import type { AppriseStatus } from '@root/types/notification.types'
import { TriangleAlert } from 'lucide-react'
import { ExternalLink } from '@/components/external-link'
import { InlineCode } from '@/components/inline-code'
import { InfoLine } from '@/components/settings/info-line'
import { SettingsSection } from '@/components/settings/settings-section'
import type { useAppriseForm } from '@/features/notifications/hooks/apprise/useAppriseForm'
import {
  APPRISE_DOCS_URL,
  APPRISE_URL_FORMATS_URL,
} from '@/features/notifications/lib/apprise'

const setupLink = (
  <ExternalLink href={APPRISE_DOCS_URL}>Apprise setup</ExternalLink>
)

interface AppriseServerSectionProps {
  form: ReturnType<typeof useAppriseForm>['form']
  status: AppriseStatus
}

export function AppriseServerSection({
  form,
  status,
}: AppriseServerSectionProps) {
  return (
    <SettingsSection
      title="Apprise server"
      description="Where Pulsarr hands off notifications for delivery."
    >
      <form.AppField name="appriseUrl">
        {(field) => (
          <field.TextField
            label="Server URL"
            type="url"
            placeholder="http://apprise:8000"
          />
        )}
      </form.AppField>
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
      {status === 'unreachable' && (
        <InfoLine icon={TriangleAlert} tone="warn" action={setupLink}>
          Pulsarr can't reach this server. It keeps checking and turns Apprise
          on once the server answers.
        </InfoLine>
      )}
      {status === 'not_configured' && (
        <InfoLine action={setupLink}>
          Enter the address of your Apprise server to turn on Apprise
          notifications.
        </InfoLine>
      )}
    </SettingsSection>
  )
}
