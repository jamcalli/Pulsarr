import { ErrorAlert } from '@/components/error-alert'
import { MediaAboutContent } from '@/components/media-detail/media-about'
import { useMediaDetail } from '@/hooks/useMediaDetail'
import { metadataGuid } from '@/lib/media-item'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

export function ApprovalMediaInfo({ approval }: { approval: ApprovalRequest }) {
  const type = approval.contentType
  const { metadata, notFound, errorMessage } = useMediaDetail({
    open: true,
    guid: metadataGuid({ type, guids: approval.contentGuids }),
    type,
  })

  if (errorMessage) return <ErrorAlert message={errorMessage} />
  return <MediaAboutContent metadata={metadata} notFound={notFound} />
}
