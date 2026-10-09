import type {
  DiagnosticItem,
  DiagnosticState,
  WatchlistDiagnostics,
} from '@root/schemas/watchlist-diagnostics/watchlist-diagnostics.schema'
import { AlertCircle, Film, Tv } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATE_LABEL: Record<DiagnosticState, string> = {
  routed: 'Routed',
  not_seen_yet: 'Not seen yet',
  removed_from_plex: 'Removed from Plex',
  excluded_global: 'Excluded (global)',
  excluded_user: 'Excluded',
  unsupported_type: 'Unsupported type',
  missing_ids: 'Missing IDs',
  awaiting_approval: 'Awaiting approval',
  approval_rejected: 'Rejected',
  approval_expired: 'Approval expired',
  approved_not_routed: 'Approved, not added',
  sync_disabled: 'Sync disabled',
  watchlist_cap: 'Watchlist cap',
  not_routed: 'Not routed',
}

const PRESENCE_LABEL: Record<DiagnosticItem['presence'], string> = {
  both: 'Plex + Pulsarr',
  plex_only: 'Plex only',
  pulsarr_only: 'Pulsarr only',
  not_checked: 'Not checked',
}

type ItemFilter = 'attention' | 'all' | DiagnosticState

interface WatchlistDiagnosticsResultsProps {
  diagnostics: WatchlistDiagnostics
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-base border-2 border-border bg-secondary-background px-3 py-2">
      <div className="text-xs text-foreground/70">{label}</div>
      <div className="text-lg font-heading text-foreground">{value}</div>
    </div>
  )
}

/**
 * Renders one diagnostics run: a summary, warnings about the run itself, and
 * a filterable table with the plain-language reason for every item.
 */
export function WatchlistDiagnosticsResults({
  diagnostics,
}: WatchlistDiagnosticsResultsProps) {
  const [filter, setFilter] = React.useState<ItemFilter>('attention')
  const [search, setSearch] = React.useState('')

  const presentStates = React.useMemo(
    () =>
      (Object.keys(STATE_LABEL) as DiagnosticState[]).filter((state) =>
        diagnostics.items.some((item) => item.state === state),
      ),
    [diagnostics.items],
  )

  const visibleItems = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return diagnostics.items.filter((item) => {
      if (filter === 'attention' && item.state === 'routed') return false
      if (filter !== 'attention' && filter !== 'all' && item.state !== filter)
        return false
      return !needle || item.title.toLowerCase().includes(needle)
    })
  }, [diagnostics.items, filter, search])

  const { summary, live, workflow, user } = diagnostics

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat label="On Plex" value={summary.onPlex} />
        <SummaryStat label="In Pulsarr" value={summary.inPulsarr} />
        <SummaryStat label="Routed" value={summary.routed} />
        <SummaryStat label="Needs attention" value={summary.needsAttention} />
        <SummaryStat label="Plex only" value={summary.plexOnly} />
        <SummaryStat label="Pulsarr only" value={summary.pulsarrOnly} />
      </div>

      {live.truncated && (
        <Alert variant="warn">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Partial check</AlertTitle>
          <AlertDescription>
            This watchlist is longer than the {live.maxItems} items a diagnostic
            fetches from Plex. Stored items beyond that are marked "Not checked"
            and are explained from Pulsarr's data only.
          </AlertDescription>
        </Alert>
      )}

      {workflow.status !== 'running' && (
        <Alert variant="warn">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Watchlist workflow is {workflow.status}</AlertTitle>
          <AlertDescription>
            New watchlist items are not picked up until the workflow is started
            from the dashboard.
          </AlertDescription>
        </Alert>
      )}

      {!user.canSync && (
        <Alert variant="warn">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync is disabled for {user.name}</AlertTitle>
          <AlertDescription>
            Pulsarr ignores this user's watchlist until sync is enabled on the
            Plex Users page.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Filter by title..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:max-w-xs"
          aria-label="Filter by title"
        />
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as ItemFilter)}
        >
          <SelectTrigger className="sm:w-56" aria-label="Filter by state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="attention">Needs attention</SelectItem>
            <SelectItem value="all">All items</SelectItem>
            {presentStates.map((state) => (
              <SelectItem key={state} value={state}>
                {STATE_LABEL[state]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-foreground/70 sm:ml-auto">
          {visibleItems.length} of {diagnostics.items.length} items
        </span>
      </div>

      <div className="w-full min-w-0 overflow-x-auto font-base text-main-foreground">
        <Table>
          <TableHeader className="font-heading">
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="whitespace-nowrap">State</TableHead>
              <TableHead>Why</TableHead>
              <TableHead className="whitespace-nowrap">Where</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  {diagnostics.items.length === 0
                    ? 'This watchlist is empty on Plex and in Pulsarr.'
                    : 'No items match this filter.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <TableRow key={`${item.presence}:${item.key}`}>
                  <TableCell className="min-w-48">
                    <div className="flex items-center gap-2">
                      {item.type === 'show' ? (
                        <Tv className="h-4 w-4 shrink-0" />
                      ) : (
                        <Film className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-foreground/70">
                      {[
                        item.ids.tmdb !== null && `TMDB ${item.ids.tmdb}`,
                        item.ids.tvdb !== null && `TVDB ${item.ids.tvdb}`,
                        item.ids.imdb,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No external IDs'}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant={item.state === 'routed' ? 'default' : 'warn'}
                    >
                      {STATE_LABEL[item.state]}
                    </Badge>
                    <div className="mt-1 text-xs text-foreground/70">
                      {PRESENCE_LABEL[item.presence]}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-64 text-sm">
                    {item.reason}
                    {item.lastNotifiedAt && (
                      <div className="mt-1 text-xs text-foreground/70">
                        Last notified{' '}
                        {new Date(item.lastNotifiedAt).toLocaleString()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.instances.length === 0 ? (
                      <span className="text-foreground/70">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {item.instances.map((instance) => (
                          <li
                            key={`${instance.arr}:${instance.instanceId}`}
                            className="whitespace-nowrap"
                          >
                            {instance.instanceName}{' '}
                            <span className="text-foreground/70">
                              ({instance.status}
                              {instance.syncing ? ', syncing' : ''})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
