import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { FactList, FactListSkeleton } from '@/components/fact-list'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useWatchRegion } from '@/features/home/hooks/useWatchRegion'
import {
  type MediaMetadata,
  mediaFacts,
  providerGroups,
} from '@/features/home/lib/media-facts'
import { useImageFallback } from '@/hooks/useImageFallback'
import { providerLogoUrl } from '@/lib/poster-url'

const SECTION = 'flex flex-col gap-6'
const BLOCK = 'flex flex-col gap-3'
const HEADER_ROW = 'flex flex-wrap items-center justify-between gap-2'
const PROVIDER_GROUP = 'flex flex-col gap-1.5'
const PROVIDER_ROW = 'flex flex-wrap gap-1.5'
const SKELETON_PROVIDERS = ['a', 'b', 'c']

function WhereToWatch({ metadata }: { metadata: MediaMetadata }) {
  const region = useWatchRegion(true)
  const groups = providerGroups(metadata)

  return (
    <div className={BLOCK}>
      <div className={HEADER_ROW}>
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
          <div key={group.label} className={PROVIDER_GROUP}>
            <h4 className="text-xs font-bold text-muted-foreground">
              {group.label}
            </h4>
            <div className={PROVIDER_ROW}>
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
    <section className={SECTION}>
      <div className={BLOCK}>
        <h3 className="font-heading font-bold">About</h3>
        {overview && <p>{overview}</p>}
        {facts.length > 0 && <FactList facts={facts} />}
      </div>
      <WhereToWatch metadata={metadata} />
    </section>
  )
}

export function MediaAboutSkeleton() {
  return (
    <div className={SECTION}>
      <div className={BLOCK}>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <FactListSkeleton rows={4} />
      </div>
      <div className={BLOCK}>
        <div className={HEADER_ROW}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className={PROVIDER_GROUP}>
          <Skeleton className="h-3 w-16" />
          <div className={PROVIDER_ROW}>
            {SKELETON_PROVIDERS.map((key) => (
              <Skeleton key={key} className="h-6 w-24" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
