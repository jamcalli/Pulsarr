import { Monitor, Tv } from 'lucide-react'
import { useMemo } from 'react'
import { TmdbContentViewer } from '@/components/tmdb-content-viewer'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import type { components } from '@/types/api.js'

type ContentStat = components['schemas']['ContentStat']

interface ContentDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentStat: ContentStat
}

export function ContentDetailModal({
  open,
  onOpenChange,
  contentStat,
}: ContentDetailModalProps) {
  const title = contentStat.title
  const contentType = contentStat.content_type
  const guids = contentStat.guids || []

  // TVDB first for shows, since TMDB show ids collide with movie ids
  const prioritizedGuids = useMemo(() => {
    return contentType === 'show'
      ? [...guids].sort((a, b) => {
          if (a.startsWith('tvdb:')) return -1
          if (b.startsWith('tvdb:')) return 1
          return 0
        })
      : guids
  }, [contentType, guids])

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-[800px] h-[90vh] flex flex-col text-foreground">
        <CredenzaHeader className="mb-6 shrink-0">
          <CredenzaTitle className="flex items-center gap-2 text-foreground text-xl">
            {contentType === 'movie' ? (
              <Monitor className="w-5 h-5" />
            ) : (
              <Tv className="w-5 h-5" />
            )}
            {title}
          </CredenzaTitle>
          <CredenzaDescription>
            Detailed information and streaming availability for this{' '}
            {contentType}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex-1 overflow-y-auto pb-4">
          <TmdbContentViewer
            target={{ id: 0, contentType, contentGuids: prioritizedGuids }}
          />
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
