import { cn } from 'cn'
import { TriangleAlert } from 'lucide-react'
import {
  ActionResults,
  ResultsTableHeader,
} from '@/components/settings/action-results'
import { InfoLine } from '@/components/settings/info-line'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  dryRunSummary,
  viewItemsLabel,
} from '@/features/library/lib/delete-sync/delete-sync-copy'
import {
  DRY_RUN_TABS,
  DRY_RUN_TYPES,
} from '@/features/library/lib/delete-sync/dry-run-items'
import { formatNumber } from '@/lib/format'
import type { components } from '@/types/api.js'

type DeleteSyncResult = components['schemas']['DeleteSyncResult']

const COLUMNS = [
  { label: 'Type' },
  { label: 'Would delete', className: 'text-right' },
  { label: 'Protected', className: 'text-right' },
  { label: 'Skipped', className: 'text-right' },
]

function CountCell({ value }: { value: number }) {
  return (
    <TableCell
      className={cn(
        'text-right tabular-nums',
        value === 0 ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {formatNumber(value)}
    </TableCell>
  )
}

function TypeTable({ result }: { result: DeleteSyncResult }) {
  return (
    <Table className="text-xs" aria-label="Dry run by type">
      <ResultsTableHeader columns={COLUMNS} />
      <TableBody>
        {DRY_RUN_TABS.map((tab) => (
          <TableRow key={tab}>
            <TableCell className="font-medium">
              {DRY_RUN_TYPES[tab].label}
            </TableCell>
            <CountCell value={result[tab].deleted} />
            <CountCell value={result[tab].protected ?? 0} />
            <CountCell value={result[tab].skipped} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

interface DryRunResultProps {
  ranAt: number
  result: DeleteSyncResult
  nothingSelected: boolean
  stale: boolean
  onView: () => void
}

export function DryRunResult({
  ranAt,
  result,
  nothingSelected,
  stale,
  onView,
}: DryRunResultProps) {
  const checkedNothing =
    !result.safetyTriggered && result.total.processed === 0 && nothingSelected
  const hasItems =
    result.movies.items.length > 0 || result.shows.items.length > 0

  return (
    <ActionResults ranAt={ranAt}>
      {stale && (
        <p className="text-muted-foreground">
          Settings changed since this dry run. Run it again to update it.
        </p>
      )}
      {checkedNothing ? (
        <InfoLine>
          Nothing is selected to delete, so the dry run checked nothing.
        </InfoLine>
      ) : (
        <>
          <p>{dryRunSummary(result)}</p>
          {result.safetyTriggered ? (
            <Alert variant="warn">
              <TriangleAlert />
              <AlertTitle>
                Dry run aborted, nothing would be deleted.
              </AlertTitle>
              <AlertDescription>{result.safetyMessage}</AlertDescription>
            </Alert>
          ) : (
            <>
              <TypeTable result={result} />
              {hasItems && (
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  className="self-start max-md:self-stretch"
                  onClick={onView}
                >
                  {viewItemsLabel(result)}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </ActionResults>
  )
}
