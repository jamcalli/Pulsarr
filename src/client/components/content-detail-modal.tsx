import type { ContentStat } from '@root/schemas/stats/stats.schema'
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

interface ContentDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentStat: ContentStat
}

/**
 * A responsive modal that displays detailed TMDB metadata for a content item from dashboard statistics.
 *
 * Uses the existing TMDB integration to fetch and display comprehensive information including ratings,
 * streaming providers, cast details, and more. Uses the credenza component for responsive dialog/drawer behavior.
 *
 * @param open - Whether the modal is currently open
 * @param onOpenChange - Callback to control modal visibility
 * @param contentStat - The content statistics object containing title, GUIDs, and content type
 */
export function ContentDetailModal({
  open,
  onOpenChange,
  contentStat,
}: ContentDetailModalProps) {
  // Get content details from the ContentStat
  const title = contentStat.title
  const contentType = contentStat.content_type || 'movie'
  const guids = contentStat.guids || []

  // Create a mock ApprovalRequestResponse structure for the TMDB hook
  // For TV shows, prioritize TVDB GUID if available to avoid TMDB ID conflicts
  const prioritizedGuids = useMemo(() => {
    return contentType === 'show'
      ? [...guids].sort((a, b) => {
          if (a.startsWith('tvdb:')) return -1
          if (b.startsWith('tvdb:')) return 1
          return 0
        })
      : guids
  }, [contentType, guids])

  const mockApprovalRequest = {
    id: 0,
    userId: 0,
    userName: '',
    contentType,
    contentTitle: title,
    contentKey: '',
    contentGuids: prioritizedGuids,
    proposedRouterDecision: { action: 'continue' as const },
    routerRuleId: null,
    status: 'pending' as const,
    triggeredBy: 'manual_flag' as const,
    approvalReason: '',
    approvalNotes: null,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    createdAt: '',
    updatedAt: '',
  }

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
          <TmdbContentViewer approvalRequest={mockApprovalRequest} />
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
