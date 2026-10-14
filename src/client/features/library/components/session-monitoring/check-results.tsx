import { ErrorAlert } from '@/components/error-alert'
import {
  ActionResults,
  ResultsTableHeader,
} from '@/components/settings/action-results'
import { StatusPill } from '@/components/status-pill'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ROLLING_UPDATE_LABELS } from '@/features/library/lib/session-monitoring/rolling-labels'
import { checkSummary } from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { formatCount } from '@/lib/format'
import type { components } from '@/types/api.js'

const CHANGE_COLUMNS = [
  { label: 'Show' },
  { label: 'What happened' },
  { label: 'Details' },
]

interface CheckResultsProps {
  ranAt: number
  result: components['schemas']['SessionMonitoringResult']
}

export function CheckResults({ ranAt, result }: CheckResultsProps) {
  const { errors, rollingUpdates } = result
  const errorTitle =
    errors.length > 0 ? formatCount(errors.length, 'error') : null

  return (
    <ActionResults ranAt={ranAt}>
      <p className="text-xs">{checkSummary(result)}</p>
      <ErrorAlert message={errorTitle}>
        {errors.map((error) => (
          <span key={error}>{error}</span>
        ))}
      </ErrorAlert>
      {rollingUpdates.length > 0 && (
        <Table className="text-xs" aria-label="Rolling changes">
          <ResultsTableHeader columns={CHANGE_COLUMNS} />
          <TableBody>
            {rollingUpdates.map((update) => (
              <TableRow key={`${update.showTitle}-${update.action}`}>
                <TableCell className="font-medium">
                  {update.showTitle}
                </TableCell>
                <TableCell>
                  <StatusPill
                    tone="requested"
                    label={ROLLING_UPDATE_LABELS[update.action]}
                  />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {update.details}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ActionResults>
  )
}
