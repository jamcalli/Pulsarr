import { DEFAULT_LOG_LEVEL } from '@root/schemas/config/config.schema'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { StatusPill } from '@/components/status-pill'
import { LogSettingsSection } from '@/features/system/components/logs/log-settings-section'
import { LogStreamCard } from '@/features/system/components/logs/log-stream-card'
import { LogsSkeleton } from '@/features/system/components/logs/logs-skeleton'
import { useLogsPage } from '@/features/system/hooks/logs/useLogsPage'
import { STREAM_PILLS } from '@/features/system/lib/logs/log-copy'
import { NAV_PAGES } from '@/lib/navigation'

const SECTION = 'System'
const TITLE = NAV_PAGES.logs.label

export default function LogsPage() {
  const page = useLogsPage()

  if (!page.isReady) return <LogsSkeleton />

  if (page.errorMessage || !page.config) {
    return (
      <Page wide>
        <PageHeader section={SECTION} title={TITLE} />
        <RetryAlert
          message="Couldn't load the log settings."
          onRetry={page.retry}
        />
      </Page>
    )
  }

  const savedLevel = page.config.logLevel ?? DEFAULT_LOG_LEVEL
  const pill = STREAM_PILLS[page.stream.status.kind]

  return (
    <Page wide>
      <PageHeader
        section={SECTION}
        title={TITLE}
        action={
          <div role="status" aria-live="polite">
            <StatusPill tone={pill.tone} label={pill.label} />
          </div>
        }
      />
      <LogStreamCard page={page} silent={savedLevel === 'silent'} />
      <LogSettingsSection
        savedLevel={savedLevel}
        initialLines={page.stream.initialLines}
        onInitialLinesChange={page.changeInitialLines}
      />
    </Page>
  )
}
