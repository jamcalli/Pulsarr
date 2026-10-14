import { compareText } from '@/lib/format'
import type { components } from '@/types/api.js'

type RollingMode = components['schemas']['SonarrRollingMonitoring']
type BulkPayload = components['schemas']['BulkManageRollingPayload']

export type EnrollableShow = components['schemas']['SonarrShowWithEnrollment']

export interface EnrollableRow {
  show: EnrollableShow
  instanceName: string
}

export interface EnrollmentValues {
  mode: RollingMode | null
  startOver: boolean
}

export const ENROLLMENT_DEFAULTS: EnrollmentValues = {
  mode: null,
  startOver: false,
}

export interface EnrollmentFilter {
  q: string
  instanceId: number | null
}

export function enrollableId(show: EnrollableShow): string {
  return `${show.sonarrInstanceId}:${show.sonarrSeriesId}`
}

export function visibleEnrollable(
  shows: readonly EnrollableShow[],
  { q, instanceId }: EnrollmentFilter,
): EnrollableShow[] {
  const needle = q.trim().toLowerCase()
  return shows
    .filter(
      (show) =>
        (needle === '' || show.title.toLowerCase().includes(needle)) &&
        (instanceId === null || show.sonarrInstanceId === instanceId),
    )
    .sort((a, b) => compareText(a.title, b.title))
}

export function bulkEnrollPayload(
  shows: readonly EnrollableShow[],
  monitoringType: RollingMode,
  resetMonitoring: boolean,
): BulkPayload {
  return {
    shows: shows.map((show) => ({
      sonarrSeriesId: show.sonarrSeriesId,
      sonarrInstanceId: show.sonarrInstanceId,
      title: show.title,
      guids: show.guids,
      rollingShowId: show.rollingShowId,
    })),
    monitoringType,
    resetMonitoring,
  }
}
