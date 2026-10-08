import { useStore } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import { saveRule } from '@/features/library/hooks/content-router/useContentRouterRules'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  inheritRouting,
  type RouteFormValues,
  type RouteRoutingValues,
  ruleFormValues,
  rulePayload,
} from '@/features/library/lib/content-router/route-form'
import { RouteFormSchema } from '@/features/library/lib/content-router/route-form.schema'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { useConfig } from '@/hooks/useConfig'
import { useCreateArrTag } from '@/hooks/useCreateArrTag'
import { useFormDirty } from '@/hooks/useFormDirty'
import { withMinDuration } from '@/hooks/useMinLoading'
import { seasonMonitoringOptions } from '@/lib/arr-labels'
import { submitThenBlurValidation, useAppForm } from '@/lib/form'
import { mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

interface RouteEditorOptions {
  type: RouteType
  /** Null for a route that is not created yet. */
  rule: RouterRule | null
  catalog: ConditionCatalog
  targets: RouteTargets
  onSaved: () => void
  reportDirty: (dirty: boolean) => void
}

export function useRouteEditorForm({
  type,
  rule,
  catalog,
  targets,
  onSaved,
  reportDirty,
}: RouteEditorOptions) {
  const { instances } = targets
  const { config } = useConfig()
  const [newEnabled, setNewEnabled] = useState(true)

  const routingDefaults = (instanceId: number | null): RouteRoutingValues => {
    const target =
      (instanceId === null ? null : instances.findTarget(instanceId)) ??
      instances.configuredDefault ??
      instances.configuredTargets[0] ??
      null
    return inheritRouting(target ? String(target.instance.id) : '')
  }

  const [defaultValues] = useState(() =>
    ruleFormValues(rule, {
      routingDefaults,
      resolve: catalog.controlFor,
      blank: catalog.blank,
    }),
  )

  const mutation = useMutation({
    mutationFn: (values: RouteFormValues) =>
      withMinDuration(
        saveRule(
          rule?.id ?? null,
          rulePayload(values, {
            type,
            enabled: rule?.enabled ?? newEnabled,
            numeric: catalog.numeric,
          }),
        ),
      ),
  })

  const form = useAppForm({
    defaultValues,
    validationLogic: submitThenBlurValidation,
    validators: { onDynamic: RouteFormSchema },
    // The editor shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value }) =>
      mutation
        .mutateAsync(value)
        .then(onSaved)
        .catch(() => undefined),
  })

  const dirty = useFormDirty(form)
  useEffect(() => {
    reportDirty(dirty)
  }, [dirty, reportDirty])
  useEffect(() => () => reportDirty(false), [reportDirty])

  const instanceId = Number(
    useStore(form.store, (state) => state.values.routing.instanceId),
  )
  const seasonMonitoring = useStore(
    form.store,
    (state) => state.values.routing.seasonMonitoring,
  )
  const routing = useArrInstanceOptions(type, instanceId || null, true)
  const createTag = useCreateArrTag(type, instanceId || null)
  const rollingEnabled = config?.plexSessionMonitoring?.enabled ?? false

  return {
    form,
    dirty,
    isNew: rule === null,
    saving: mutation.isPending,
    errorMessage:
      mutation.isPending || !mutation.error
        ? null
        : mutationErrorMessage(
            mutation.error,
            'The route was not saved. Save again to retry.',
          ),
    newEnabled,
    setNewEnabled,
    routing,
    createTag,
    instanceOptions: instances.configuredTargets.map(({ instance }) => ({
      value: String(instance.id),
      label: instance.isDefault ? `${instance.name} (default)` : instance.name,
    })),
    seasonMonitoringOptions: seasonMonitoringOptions(
      seasonMonitoring,
      rollingEnabled,
    ),
    switchInstance: (id: string) => {
      const next = inheritRouting(id)
      form.setFieldValue('routing.qualityProfile', next.qualityProfile)
      form.setFieldValue('routing.rootFolder', next.rootFolder)
      form.setFieldValue('routing.tags', next.tags)
      form.setFieldValue('routing.searchOnAdd', next.searchOnAdd)
      form.setFieldValue('routing.seasonMonitoring', next.seasonMonitoring)
      form.setFieldValue('routing.seriesType', next.seriesType)
      form.setFieldValue('routing.monitor', next.monitor)
    },
  }
}

export type RouteEditor = ReturnType<typeof useRouteEditorForm>
export type RouteEditorForm = RouteEditor['form']
