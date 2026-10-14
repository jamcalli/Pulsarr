import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { CopyButton } from '@/components/copy-button'
import { DeleteButton } from '@/components/delete-button'
import { EmptyState } from '@/components/empty-state'
import { SecretRevealButton } from '@/components/form/secret-reveal-button'
import {
  SeparatedList,
  SeparatedListActions,
  SeparatedListRow,
} from '@/components/separated-list'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { useRevokeApiKey } from '@/features/system/hooks/api-keys/useApiKeys'
import { formatRelative } from '@/lib/format'
import type { components } from '@/types/api.js'

type ApiKey = components['schemas']['ApiKey']

const SKELETON_ROWS = 3
const CONTENT_CLASS = 'min-w-0 basis-40'
const KEY_CLASS = 'min-w-0 max-md:w-full md:w-104'
const REVEAL_LABEL = { show: 'Show key', hide: 'Hide key' }

function KeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey
  onRevoke: () => void
}) {
  const [shown, setShown] = useState(false)

  return (
    <SeparatedListRow>
      <ItemContent className={CONTENT_CLASS}>
        <ItemTitle className="break-all">{apiKey.name}</ItemTitle>
        <ItemDescription>
          Created {formatRelative(new Date(apiKey.created_at))}
        </ItemDescription>
      </ItemContent>
      <InputGroup className={KEY_CLASS}>
        <InputGroupInput
          readOnly
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          value={apiKey.key}
          aria-label={`Key for ${apiKey.name}`}
          className="font-mono"
        />
        <InputGroupAddon align="inline-end">
          <SecretRevealButton
            shown={shown}
            onToggle={() => setShown(!shown)}
            revealLabel={REVEAL_LABEL}
          />
          <CopyButton value={apiKey.key} label="Copy key" />
        </InputGroupAddon>
      </InputGroup>
      <SeparatedListActions>
        <DeleteButton size="sm" onClick={onRevoke}>
          Revoke
        </DeleteButton>
      </SeparatedListActions>
    </SeparatedListRow>
  )
}

export function ApiKeysCard({ apiKeys }: { apiKeys: ApiKey[] }) {
  const revoke = useRevokeApiKey()
  const [confirm, setConfirm] = useState<{
    open: boolean
    apiKey: ApiKey | null
  }>({ open: false, apiKey: null })

  const content =
    apiKeys.length === 0 ? (
      <EmptyState
        icon={<KeyRound />}
        title="No API keys yet"
        description="Create one above to let another app call Pulsarr."
      />
    ) : (
      <SeparatedList label="API keys">
        {apiKeys.map((apiKey) => (
          <KeyRow
            key={apiKey.id}
            apiKey={apiKey}
            onRevoke={() => {
              revoke.reset()
              setConfirm({ open: true, apiKey })
            }}
          />
        ))}
      </SeparatedList>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitleCount title="Keys" count={apiKeys.length} />
      </CardHeader>
      <CardContent>{content}</CardContent>
      <ConfirmCredenza
        open={confirm.open}
        onOpenChange={(open) => setConfirm((prev) => ({ ...prev, open }))}
        title={`Revoke ${confirm.apiKey?.name ?? 'key'}?`}
        description="Anything using this key loses access right away. You can't undo this."
        confirmLabel="Revoke key"
        confirmVariant="destructive"
        pending={revoke.pending}
        pendingLabel="Revoking..."
        errorMessage={revoke.errorMessage}
        onConfirm={() => {
          if (!confirm.apiKey) return
          revoke.revoke(confirm.apiKey.id, {
            onSuccess: () => setConfirm((prev) => ({ ...prev, open: false })),
          })
        }}
      />
    </Card>
  )
}

export function ApiKeysCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton badge />
      <CardContent>
        <SeparatedList>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => `row-${row}`).map(
            (key) => (
              <SeparatedListRow key={key}>
                <ItemContent className={CONTENT_CLASS}>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                </ItemContent>
                <Skeleton className={`h-10 ${KEY_CLASS}`} />
                <SeparatedListActions>
                  <Skeleton className="h-8 w-24" />
                </SeparatedListActions>
              </SeparatedListRow>
            ),
          )}
        </SeparatedList>
      </CardContent>
    </Card>
  )
}
