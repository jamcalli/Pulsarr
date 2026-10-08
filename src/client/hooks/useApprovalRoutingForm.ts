import { useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { useArrInstances } from '@/hooks/useArrInstances'
import { useConfig } from '@/hooks/useConfig'
import { useFormDirty } from '@/hooks/useFormDirty'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { type ArrTarget, defaultRouting, instanceOptions } from '@/lib/approval'
import {
  ApprovalRoutingFormSchema,
  routingFormValues,
  routingFromValues,
} from '@/lib/approval-routing-form'
import { seasonMonitoringOptions } from '@/lib/arr-labels'
import { submitThenBlurValidation, useAppForm } from '@/lib/form'
import type { components } from '@/types/api.js'

type ApprovalRouting = components['schemas']['ApprovalRouting']

interface ApprovalRoutingFormOptions {
  type: ArrTarget['type']
  initial: ApprovalRouting
  review: ApprovalReview
}

export function useApprovalRoutingForm({
  type,
  initial,
  review,
}: ApprovalRoutingFormOptions) {
  const instances = useArrInstances(type)
  const { config } = useConfig()

  const defaultValues = routingFormValues(initial)

  const form = useAppForm({
    defaultValues,
    validationLogic: submitThenBlurValidation,
    validators: { onDynamic: ApprovalRoutingFormSchema },
    onSubmit: ({ value }) => {
      const target = instances.findTarget(Number(value.instanceId))
      review.saveRouting(
        routingFromValues(value, {
          type,
          priority: initial.priority,
          synced: syncsWith(target),
        }),
      )
    },
  })

  const dirty = useFormDirty(form)
  const leaveGuard = useLeaveGuard(dirty)
  const { reportRoutingDirty } = review
  useEffect(() => {
    reportRoutingDirty(dirty)
    return () => reportRoutingDirty(false)
  }, [dirty, reportRoutingDirty])

  const instanceId = Number(useStore(form.store, (s) => s.values.instanceId))
  const seasonMonitoring = useStore(
    form.store,
    (s) => s.values.seasonMonitoring,
  )
  const target = instances.findTarget(instanceId)
  const options = useArrInstanceOptions(type, instanceId, true)
  const rollingEnabled = config?.plexSessionMonitoring?.enabled ?? false

  function syncsWith(selected: ArrTarget | null): boolean {
    const configuredDefault = instances.configuredDefault
    return (
      configuredDefault !== null &&
      selected?.instance.id === configuredDefault.instance.id &&
      instances.configuredTargets.length > 1
    )
  }

  return {
    form,
    dirty,
    leaveGuard,
    instanceId,
    options,
    showSynced: syncsWith(target),
    instanceOptions: instanceOptions(instances.targets, initial.instanceId),
    syncedOptions: instances.configuredTargets
      .filter(({ instance }) => instance.id !== instanceId)
      .map(({ instance }) => ({
        value: String(instance.id),
        label: instance.name,
      })),
    seasonMonitoringOptions: seasonMonitoringOptions(
      seasonMonitoring,
      rollingEnabled,
    ),
    switchInstance: (id: string) => {
      const next = instances.findTarget(Number(id))
      if (!next) return
      form.reset(routingFormValues(defaultRouting(next)), {
        keepDefaultValues: true,
      })
    },
  }
}
