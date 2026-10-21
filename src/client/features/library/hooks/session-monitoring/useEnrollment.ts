import { useMutation } from '@tanstack/react-query'
import type { RowSelectionState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { PageSize } from '@/components/data-table/page-size'
import {
  bulkEnrollPayload,
  type EnrollableRow,
  type EnrollmentFilter,
  enrollableId,
  enrollmentPageSizePref,
  visibleEnrollable,
} from '@/features/library/lib/session-monitoring/enrollment'
import { invalidateEnrollment } from '@/features/library/lib/session-monitoring/session-monitoring-queries'
import { useArrInstances } from '@/hooks/useArrInstances'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { paginate } from '@/lib/paginate'
import { usePref } from '@/lib/prefs'
import {
  $api,
  apiFetch,
  loadErrorMessage,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type BulkPayload = components['schemas']['BulkManageRollingPayload']

export interface EnrollmentResult {
  total: number
  failed: number
}

const NO_FILTER: EnrollmentFilter = { q: '', instanceId: null }

const DIALOG_PAGE_HREF = () => '#'

async function applyEnrollment(
  payload: BulkPayload,
): Promise<EnrollmentResult> {
  const { data, error } = await apiFetch.POST(
    '/v1/session-monitoring/rolling-monitored/bulk',
    { body: payload },
  )
  if (error) throw error
  return { total: payload.shows.length, failed: requireSuccess(data).failed }
}

export function useEnrollment() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(NO_FILTER)
  const [page, setPage] = useState(1)
  const [pageSize, savePageSize] = usePref(enrollmentPageSizePref)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [result, setResult] = useState<EnrollmentResult | null>(null)
  const query = $api.useQuery(
    'get',
    '/v1/session-monitoring/sonarr-shows',
    undefined,
    { enabled: open },
  )
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (payload: BulkPayload) =>
        withMinDuration(applyEnrollment(payload)),
      onSuccess: setResult,
      onSettled: () => invalidateEnrollment(),
    }),
  )

  const instances = useArrInstances('sonarr')

  const shows = query.data?.shows ?? null
  const selected = (shows ?? []).filter((show) => selection[enrollableId(show)])
  const matching = useMemo(
    () => shows && visibleEnrollable(shows, filter),
    [shows, filter],
  )
  const paged = paginate(matching ?? [], page, pageSize)
  const rows: EnrollableRow[] | null =
    matching &&
    paged.rows.map((show) => ({
      show,
      instanceName:
        instances.findTarget(show.sonarrInstanceId)?.instance.name ?? '',
    }))

  return {
    open,
    openCredenza: () => {
      setFilter(NO_FILTER)
      setPage(1)
      setSelection({})
      setResult(null)
      mutation.reset()
      setOpen(true)
    },
    setOpen: (next: boolean) => {
      if (!mutation.isPending) setOpen(next)
    },
    shows,
    rows,
    total: matching?.length ?? 0,
    page: paged.page,
    pageHref: DIALOG_PAGE_HREF,
    setPage,
    pageSize,
    setPageSize: (size: PageSize) => {
      savePageSize(size)
      setPage(1)
    },
    instanceOptions: instances.configuredTargets.map(({ instance }) => ({
      value: instance.id,
      label: instance.name,
    })),
    loadError: loadErrorMessage(query, "Couldn't load the shows."),
    retry: () => void query.refetch(),
    filter,
    updateFilter: (patch: Partial<EnrollmentFilter>) => {
      setFilter({ ...filter, ...patch })
      setPage(1)
    },
    selection,
    setSelection,
    selected,
    result,
    backToList: () => setResult(null),
    apply: (
      mode: BulkPayload['monitoringType'],
      startOver: boolean,
      onSuccess?: () => void,
    ) =>
      mutation.mutate(bulkEnrollPayload(selected, mode, startOver), {
        onSuccess,
      }),
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The shows were not updated. Try again.',
        )
      : null,
  }
}

export type Enrollment = ReturnType<typeof useEnrollment>
