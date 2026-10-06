import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { FactList } from '@/components/fact-list'
import { Badge } from '@/components/ui/badge'
import { useWatchRegion } from '@/features/home/hooks/useWatchRegion'
import {
  type MediaMetadata,
  mediaFacts,
  providerGroups,
} from '@/features/home/lib/media-facts'
import { useImageFallback } from '@/hooks/useImageFallback'
import { providerLogoUrl } from '@/lib/poster-url'

function WhereToWatch({ metadata }: { metadata: MediaMetadata }) {
  const region = useWatchRegion(true)
  const groups = providerGroups(metadata)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-bold">Where to watch</h3>
        <CompactSelect
          label="Region"
          value={region.region}
          options={region.options}
          disabled={!region.ready || region.isSaving}
          onValueChange={region.setRegion}
        />
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">
          Not available to stream, rent or buy in {region.region}.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-bold text-muted-foreground">
              {group.label}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.providers.map((provider) => {
                return (
                  <Badge key={provider.provider_id} variant="secondary">
                    <ProviderLogo path={provider.logo_path} />
                    {provider.provider_name}
                  </Badge>
                )
              })}
            </div>
          </div>
        ))
      )}
      <ErrorAlert message={region.errorMessage} />
    </div>
  )
}

function ProviderLogo({ path }: { path: string | null }) {
  const { src, onError } = useImageFallback(providerLogoUrl(path))
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={onError}
      className="size-4 rounded-sm"
    />
  )
}

export function MediaAbout({ metadata }: { metadata: MediaMetadata }) {
  const { overview } = metadata.details
  const facts = mediaFacts(metadata.details)

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="font-heading font-bold">About</h3>
        {overview && <p>{overview}</p>}
        {facts.length > 0 && <FactList facts={facts} />}
      </div>
      <WhereToWatch metadata={metadata} />
    </section>
  )
}
