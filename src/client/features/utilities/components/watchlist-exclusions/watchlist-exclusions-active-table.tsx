import type { GetWatchlistExclusionsResponse } from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { useRemoveWatchlistExclusion } from '@/features/utilities/hooks/useWatchlistExclusionMutations'

type ExclusionEntry = GetWatchlistExclusionsResponse['exclusions'][number]

export interface WatchlistExclusionsActiveTableRef {
  clearSelection: () => void
}

interface WatchlistExclusionsActiveTableProps {
  exclusions: ExclusionEntry[]
  keyToTitleMap: Map<string, string>
  onRemove: (entry: {
    exclusionId: number
    key: string
    username: string
  }) => void
  onBulkRemove: (ids: number[]) => void
  removeMutation: ReturnType<typeof useRemoveWatchlistExclusion>
  selectionRef?: React.RefObject<WatchlistExclusionsActiveTableRef | null>
}

export function WatchlistExclusionsActiveTable({
  exclusions,
  keyToTitleMap,
  onRemove,
  onBulkRemove,
  removeMutation,
  selectionRef,
}: WatchlistExclusionsActiveTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const visibleIds = useMemo(() => exclusions.map((e) => e.id), [exclusions])

  // Drop selections that no longer exist (after a removal)
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(visibleIds)
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (visible.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [visibleIds])

  // Expose clearSelection for the page to call after bulk-remove completes
  useEffect(() => {
    if (!selectionRef) return
    selectionRef.current = { clearSelection: () => setSelectedIds(new Set()) }
    return () => {
      if (selectionRef.current) selectionRef.current = null
    }
  }, [selectionRef])

  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someSelected =
    !allSelected && visibleIds.some((id) => selectedIds.has(id))

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(visibleIds) : new Set())
  }

  const toggleOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="w-full min-w-0 font-base text-main-foreground overflow-x-auto space-y-2">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-start gap-2">
          <Button
            variant="error"
            size="sm"
            className="flex items-center gap-2 h-10"
            onClick={() => onBulkRemove(Array.from(selectedIds))}
          >
            <Trash2 className="h-4 w-4" />
            Bulk Remove ({selectedIds.size})
          </Button>
        </div>
      )}

      <div className="rounded-md">
        <Table>
          <TableHeader className="font-heading">
            <TableRow>
              <TableHead className="px-2 py-2 w-10">
                <Checkbox
                  checked={allSelected || (someSelected && 'indeterminate')}
                  onCheckedChange={(value) => toggleAll(!!value)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="px-2 py-2">Title</TableHead>
              <TableHead className="px-2 py-2">Scope</TableHead>
              <TableHead className="px-2 py-2">Excluded</TableHead>
              <TableHead className="px-2 py-2 w-25 text-center">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exclusions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No active exclusions found.
                </TableCell>
              </TableRow>
            ) : (
              exclusions.map((entry) => {
                const isGlobal = entry.user_id === 0
                const title = keyToTitleMap.get(entry.key)
                const isRemoving =
                  removeMutation.isPending &&
                  removeMutation.variables === entry.id
                const isSelected = selectedIds.has(entry.id)

                return (
                  <TableRow
                    key={entry.id}
                    data-state={isSelected ? 'selected' : undefined}
                  >
                    <TableCell className="px-2 py-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(value) =>
                          toggleOne(entry.id, !!value)
                        }
                        aria-label="Select row"
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {title ? (
                        <span className="font-medium">{title}</span>
                      ) : (
                        <span
                          className="text-sm text-muted-foreground font-mono truncate inline-block max-w-xs align-bottom"
                          title={entry.key}
                        >
                          {entry.key}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {isGlobal ? (
                        <Badge variant="warn">Global</Badge>
                      ) : (
                        <span className="truncate inline-block max-w-37.5">
                          {entry.username}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2 text-sm text-muted-foreground">
                      {new Date(entry.excluded_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <div className="flex justify-center">
                        <Button
                          variant="error"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            onRemove({
                              exclusionId: entry.id,
                              key: entry.key,
                              username: entry.username,
                            })
                          }
                          disabled={isRemoving}
                        >
                          {isRemoving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="ml-1">
                            {isRemoving ? 'Removing...' : 'Remove'}
                          </span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
