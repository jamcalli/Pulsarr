import { SEASON_MONITORING_LABELS } from '@root/schemas/sonarr/season-monitoring.schema'
import type { ColumnDef } from '@tanstack/react-table'
import type { EnrollableRow } from '@/features/library/lib/session-monitoring/enrollment'

/** No accessors, so the list keeps its title order and no header sorts. */
export const ENROLLMENT_COLUMNS: ColumnDef<EnrollableRow>[] = [
  {
    id: 'show',
    header: 'Show',
    cell: ({ row }) => (
      <span className="font-medium">{row.original.show.title}</span>
    ),
  },
  {
    id: 'instance',
    header: 'Instance',
    cell: ({ row }) => row.original.instanceName,
  },
  {
    id: 'mode',
    header: 'Rolling mode',
    cell: ({ row }) => {
      const mode = row.original.show.monitoringType
      return mode ? (
        SEASON_MONITORING_LABELS[mode]
      ) : (
        <span className="text-muted-foreground">Not rolling</span>
      )
    },
  },
]

export const ENROLLMENT_COLUMN_CLASSES: Partial<Record<string, string>> = {
  show: 'whitespace-normal',
}
