import type { TokenLinkForm } from '@/hooks/plex/useTokenLinkForm'
import { TOKEN_FAILURE_MESSAGES } from '@/lib/plex/plex-requests'

const REVEAL_LABEL = { show: 'Show token', hide: 'Hide token' }

export function TokenField({ link }: { link: TokenLinkForm }) {
  return (
    <link.form.AppField name="token">
      {(field) => (
        <field.SecretField
          label="Plex token"
          orientation="vertical"
          revealLabel={REVEAL_LABEL}
          error={link.failure ? TOKEN_FAILURE_MESSAGES[link.failure] : null}
          disabled={link.busy}
          autoFocus
        />
      )}
    </link.form.AppField>
  )
}
