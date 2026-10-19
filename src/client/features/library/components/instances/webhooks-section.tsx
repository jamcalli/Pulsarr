import { SettingsSection } from '@/components/settings/settings-section'
import {
  WebhookAddressForm,
  WebhookResults,
} from '@/components/settings/webhook-address-form'
import type { WebhookSection } from '@/hooks/arr/useWebhookAddress'

interface WebhooksSectionProps {
  webhook: WebhookSection
  saving: boolean
}

export function WebhooksSection({ webhook, saving }: WebhooksSectionProps) {
  return (
    <SettingsSection
      title="Webhooks"
      description="How Radarr and Sonarr reach Pulsarr."
    >
      <WebhookAddressForm
        form={webhook.form}
        fields="webhook"
        disabled={saving}
      />
      {webhook.result && (
        <WebhookResults
          ranAt={webhook.result.ranAt}
          results={webhook.result.data}
        />
      )}
    </SettingsSection>
  )
}
