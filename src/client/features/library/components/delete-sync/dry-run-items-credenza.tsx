import { CircleCheck } from 'lucide-react'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { DataTable } from '@/components/data-table/data-table'
import { EmptyState } from '@/components/empty-state'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import { SearchField } from '@/components/search-field'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DRY_RUN_COLUMN_CLASSES,
  DRY_RUN_COLUMNS,
} from '@/features/library/components/delete-sync/dry-run-columns'
import { useDryRunItems } from '@/features/library/hooks/delete-sync/useDryRunItems'
import {
  itemsCountLine,
  itemsDescription,
} from '@/features/library/lib/delete-sync/delete-sync-copy'
import {
  DRY_RUN_SORT_KEYS,
  DRY_RUN_TABS,
  DRY_RUN_TYPES,
  type DryRunItemRow,
  type DryRunTab,
} from '@/features/library/lib/delete-sync/dry-run-items'
import { formatNumber, upperFirst } from '@/lib/format'
import type { components } from '@/types/api.js'

const TOOLBAR = 'flex flex-wrap items-center gap-2'

function rowId(row: DryRunItemRow): string {
  return row.id
}

function TypeFilter({
  value,
  counts,
  onValueChange,
}: {
  value: DryRunTab
  counts: Record<DryRunTab, number>
  onValueChange: (next: DryRunTab) => void
}) {
  const segments = DRY_RUN_TABS.map((tab) => ({
    value: tab,
    label: (
      <>
        {DRY_RUN_TYPES[tab].label}
        <Badge variant="secondary">{formatNumber(counts[tab])}</Badge>
      </>
    ),
  }))
  return (
    <SegmentedControl<DryRunTab>
      aria-label="Content type"
      value={value}
      onValueChange={onValueChange}
      options={segments}
    />
  )
}

interface DryRunItemsCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: components['schemas']['DeleteSyncResult']
  deleteFiles: boolean
}

export function DryRunItemsCredenza({
  open,
  onOpenChange,
  result,
  deleteFiles,
}: DryRunItemsCredenzaProps) {
  const items = useDryRunItems(result)
  const noun = `${DRY_RUN_TYPES[items.tab].noun}s`

  const body =
    items.total === 0 ? (
      <EmptyState
        icon={<CircleCheck />}
        title={`No ${noun} would be deleted`}
      />
    ) : items.rows.length === 0 ? (
      <NoMatchesEmpty
        title={`No ${noun} match "${items.search.trim()}"`}
        description="Try another title or GUID."
        clearLabel="Clear search"
        onClear={() => items.setSearch('')}
      />
    ) : (
      <DataTable
        label={`${upperFirst(noun)} that would be deleted`}
        columns={DRY_RUN_COLUMNS}
        columnClasses={DRY_RUN_COLUMN_CLASSES}
        variant="flat"
        data={items.rows}
        getRowId={rowId}
        sorting={[items.sort]}
        onSortingChange={(next) => {
          const [first] = next
          const id = DRY_RUN_SORT_KEYS.find((key) => key === first?.id)
          if (first && id) items.setSort({ id, desc: first.desc })
        }}
      />
    )

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="md:max-w-xl">
        <CredenzaHeader>
          <CredenzaTitle>Dry run result</CredenzaTitle>
          <CredenzaDescription>
            {itemsDescription(result, deleteFiles)}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="flex flex-col gap-3">
            <div className={TOOLBAR}>
              <SearchField
                label="Search by title or GUID"
                value={items.search}
                onValueChange={items.setSearch}
              />
              <TypeFilter
                value={items.tab}
                counts={items.counts}
                onValueChange={items.setTab}
              />
            </div>
            <p className="text-muted-foreground">
              {itemsCountLine(
                items.tab,
                items.rows.length,
                items.total,
                items.searching,
              )}
            </p>
            {body}
          </div>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose render={<Button type="button" variant="outline" />}>
            Close
          </CredenzaClose>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
