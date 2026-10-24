import { useMemo, useState } from 'react'
import {
  type DryRunSort,
  type DryRunTab,
  dryRunRows,
  visibleDryRunRows,
} from '@/features/library/lib/delete-sync/dry-run-items'
import { useInstances } from '@/hooks/arr/useInstances'
import type { components } from '@/types/api.js'

type ArrTargets = ReturnType<typeof useInstances>['instances']

function nameLookup(targets: ArrTargets): (id: string) => string {
  const names = new Map(
    targets.map(({ instance }) => [String(instance.id), instance.name]),
  )
  return (id) => names.get(id) ?? id
}

/** Search text and sort carry across tabs, and every row is on one page. */
export function useDryRunItems(
  result: components['schemas']['DeleteSyncResult'],
) {
  const radarr = useInstances('radarr')
  const sonarr = useInstances('sonarr')
  const [tab, setTab] = useState<DryRunTab>(
    result.movies.items.length > 0 || result.shows.items.length === 0
      ? 'movies'
      : 'shows',
  )
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<DryRunSort>({ id: 'title', desc: false })

  const radarrName = useMemo(
    () => nameLookup(radarr.instances),
    [radarr.instances],
  )
  const sonarrName = useMemo(
    () => nameLookup(sonarr.instances),
    [sonarr.instances],
  )
  const all = useMemo(
    () => ({
      movies: dryRunRows(result.movies.items, radarrName),
      shows: dryRunRows(result.shows.items, sonarrName),
    }),
    [result, radarrName, sonarrName],
  )
  const tabRows = all[tab]
  const rows = useMemo(
    () => visibleDryRunRows(tabRows, search, sort),
    [tabRows, search, sort],
  )

  return {
    tab,
    setTab,
    search,
    setSearch,
    sort,
    setSort,
    counts: { movies: all.movies.length, shows: all.shows.length },
    total: all[tab].length,
    rows,
    searching: search.trim() !== '',
  }
}
