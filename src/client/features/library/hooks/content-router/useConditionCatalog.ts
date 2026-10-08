import { useMemo } from 'react'
import {
  type ConditionOperator,
  conditionFields,
  type RouteType,
} from '@/features/library/lib/content-router/condition-fields'
import {
  CERTIFICATION_OPTIONS,
  type ConditionOptions,
  MOVIE_STATUS_OPTIONS,
  optionLabel,
  SERIES_STATUS_OPTIONS,
} from '@/features/library/lib/content-router/condition-options'
import {
  blankCondition,
  emptyDraftValue,
} from '@/features/library/lib/content-router/condition-tree'
import type {
  ControlResolver,
  NumericResolver,
} from '@/features/library/lib/content-router/route-form'
import type { ValueLabel } from '@/features/library/lib/content-router/rule-summary'
import {
  optionSourceFor,
  valueControlFor,
} from '@/features/library/lib/content-router/value-control'
import { useMinLoading } from '@/hooks/useMinLoading'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { compareText } from '@/lib/format'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

interface CatalogNeeds {
  genres: boolean
  /** Providers come from TMDB, so they load only when a route or the editor uses them. */
  providers: boolean
}

export function useConditionCatalog(type: RouteType, needs: CatalogNeeds) {
  const metadata = useMinLoading(
    $api.useQuery('get', '/v1/content-router/plugins/metadata'),
  )
  const { users } = useUserDirectory()
  const genres = $api.useQuery('get', '/v1/plex/genres', undefined, {
    enabled: needs.genres,
  })
  const providers = $api.useQuery('get', '/v1/tmdb/providers', undefined, {
    enabled: needs.providers,
  })

  const evaluators = metadata.data?.evaluators
  const fields = useMemo(
    () => conditionFields(evaluators ?? [], type),
    [evaluators, type],
  )

  const options: ConditionOptions = useMemo(
    () => ({
      genres: (genres.data?.genres ?? []).map((genre) => ({
        value: genre,
        label: genre,
      })),
      certifications: CERTIFICATION_OPTIONS,
      movieStatuses: MOVIE_STATUS_OPTIONS,
      seriesStatuses: SERIES_STATUS_OPTIONS,
      users: users
        .map((user) => ({ value: String(user.id), label: user.name }))
        .sort((a, b) => compareText(a.label, b.label)),
      streamingServices: (providers.data?.providers ?? [])
        .map((provider) => ({
          value: String(provider.provider_id),
          label: provider.provider_name,
        }))
        .sort((a, b) => compareText(a.label, b.label)),
    }),
    [genres.data, users, providers.data],
  )

  const controlFor: ControlResolver = (field, operator) => {
    const known = fields.find((candidate) => candidate.name === field)
    if (!known) return null
    return valueControlFor(
      field,
      known.operators.find((candidate) => candidate.name === operator),
    )
  }

  const numeric: NumericResolver = (field, operator) => {
    const control = controlFor(field, operator)
    return (
      (control?.kind === 'chips' || control?.kind === 'select') &&
      control.numeric
    )
  }

  const emptyValue = (field: string, operator: ConditionOperator) =>
    emptyDraftValue(controlFor(field, operator)?.kind ?? 'text')

  const valueLabel: ValueLabel = (field, value) => {
    const source = optionSourceFor(field)
    return source === null ? value : optionLabel(options[source], value)
  }

  return {
    fields,
    options,
    controlFor,
    numeric,
    emptyValue,
    blank: (parentId: string) => blankCondition(parentId, fields, emptyValue),
    valueLabel,
    isLoading: metadata.isLoading,
    hasMetadata: evaluators !== undefined,
    errorMessage: metadata.isError
      ? (apiErrorMessage(metadata.error) ?? 'Condition options failed to load.')
      : null,
    retry: () => void metadata.refetch(),
  }
}

export type ConditionCatalog = ReturnType<typeof useConditionCatalog>
