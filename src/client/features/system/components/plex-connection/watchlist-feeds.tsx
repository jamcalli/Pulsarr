import { FieldRow } from '@/components/form/field-row'
import { SecretCopyInput } from '@/components/secret-copy-input'
import { ActionRow } from '@/components/settings/action-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useGenerateFeeds } from '@/features/system/hooks/plex-connection/useGenerateFeeds'
import type { components } from '@/types/api.js'

const FEEDS = [
  { id: 'self-feed', label: 'Your watchlist feed', key: 'selfRss' },
  { id: 'friends-feed', label: "Friends' watchlist feed", key: 'friendsRss' },
] as const

export function FeedUrls({
  config,
}: {
  config: components['schemas']['Config']
}) {
  return (
    <div className="flex flex-col gap-4">
      {FEEDS.map(({ id, label, key }) => (
        <FieldRow key={id} label={label} orientation="vertical" htmlFor={id}>
          <SecretCopyInput
            id={id}
            value={config[key] ?? ''}
            copyLabel={`Copy ${label.toLowerCase()}`}
            revealLabel={{
              show: `Show ${label.toLowerCase()}`,
              hide: `Hide ${label.toLowerCase()}`,
            }}
          />
        </FieldRow>
      ))}
    </div>
  )
}

export function FeedUrlsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {FEEDS.map(({ id }) => (
        <div key={id} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

interface GenerateFeedsRowProps {
  generated: boolean
  hasPlexPass: boolean
  syncing: boolean
}

export function GenerateFeedsRow({
  generated,
  hasPlexPass,
  syncing,
}: GenerateFeedsRowProps) {
  const feeds = useGenerateFeeds()

  return (
    <ActionRow
      title={generated ? 'Generate feeds again' : 'Watchlist feeds'}
      description={
        generated
          ? 'Ask Plex for new URLs, replacing these two.'
          : 'With feeds, Pulsarr watches them instead of polling Plex.'
      }
      buttonLabel={generated ? 'Generate again' : 'Generate feeds'}
      busyLabel="Generating..."
      disabled={!hasPlexPass || syncing}
      unavailableReason={hasPlexPass ? null : 'Watchlist feeds need Plex Pass.'}
      running={feeds.pending}
      onRun={feeds.generate}
      errorMessage={feeds.errorMessage}
    />
  )
}
