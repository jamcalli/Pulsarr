import { ActionGroup } from '@/components/action-group'
import { ResultsTableHeader } from '@/components/settings/action-results'
import { StatBar } from '@/components/stat-bar'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { RollingShowRow } from '@/features/library/lib/session-monitoring/rolling-shows'
import { seasonProgress } from '@/features/library/lib/session-monitoring/season-progress'
import {
  enrolledLine,
  episodeOfTotal,
  seasonName,
  triggerLine,
  viewerProgress,
} from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatRelative } from '@/lib/format'

const VIEWER_COLUMNS = [
  { label: 'Viewer' },
  { label: 'Last watched' },
  { label: 'When' },
]

interface RollingShowDetailProps {
  row: RollingShowRow
  /** The saved setting with its default applied. */
  remainingEpisodes: number
  onStop: () => void
  onReset: () => void
}

function ViewerTable({
  row,
  remainingEpisodes,
}: {
  row: RollingShowRow
  remainingEpisodes: number
}) {
  const { lookup } = useUserDirectory()

  return (
    <Table className="text-xs">
      <ResultsTableHeader columns={VIEWER_COLUMNS} />
      <TableBody>
        {row.viewers.map((viewer) => {
          const username = viewer.plex_username ?? ''
          const { name } = lookup(username)
          const when = viewer.last_session_date
            ? formatRelative(new Date(viewer.last_session_date))
            : null
          const progress = seasonProgress(row.record, viewer, remainingEpisodes)
          const position = progress ? (
            <StatBar
              label={seasonName(viewer.last_watched_season)}
              value={progress.episode}
              total={progress.total}
              valueText={episodeOfTotal(progress.episode, progress.total)}
              color="chart-show"
              showPercent={false}
              detail={triggerLine(progress.trigger)}
              marker={progress.marker}
            />
          ) : (
            viewerProgress(
              viewer.last_watched_season,
              viewer.last_watched_episode,
            )
          )
          return (
            <TableRow key={viewer.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{name}</span>
                  {name !== username && (
                    <span className="text-muted-foreground">{username}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>{position}</TableCell>
              <TableCell>{when}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function RollingShowDetail({
  row,
  remainingEpisodes,
  onStop,
  onReset,
}: RollingShowDetailProps) {
  const viewers =
    row.viewers.length > 0 ? (
      <ViewerTable row={row} remainingEpisodes={remainingEpisodes} />
    ) : (
      <p className="text-muted-foreground">
        Nobody has watched it since it was enrolled.
      </p>
    )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">
        {enrolledLine(row.instanceName, row.record.created_at)}
      </p>
      {viewers}
      <ActionGroup>
        <Button type="button" variant="outline" size="sm" onClick={onStop}>
          Stop rolling
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onReset}>
          Reset show
        </Button>
      </ActionGroup>
    </div>
  )
}
