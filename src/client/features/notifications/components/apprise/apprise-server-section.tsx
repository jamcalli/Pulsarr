import type { AppriseStatus } from '@root/types/notification.types'
import { Info, TriangleAlert } from 'lucide-react'
import { FactList } from '@/components/fact-list'
import { InlineCode } from '@/components/inline-code'
import { SettingsSection } from '@/components/settings/settings-section'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { APPRISE_DOCS_URL } from '@/features/notifications/lib/apprise'

const setupLink = (
  <a
    href={APPRISE_DOCS_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={buttonVariants({ variant: 'link' })}
  >
    Apprise setup
  </a>
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
      {status === 'disabled' && (
        <Alert variant="warn">
          <TriangleAlert />
          <AlertTitle>
            Pulsarr couldn't reach this server at startup. Restart Pulsarr once
            it's running. {setupLink}
          </AlertTitle>
        </Alert>
      )}
      {status === 'not_configured' && (
        <Alert variant="info">
          <Info />
          <AlertTitle>
            Set <InlineCode>appriseUrl</InlineCode> in the environment, then
            restart Pulsarr. {setupLink}
          </AlertTitle>
        </Alert>
      )}
    </SettingsSection>
  )
}
