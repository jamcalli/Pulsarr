import { zodResolver } from '@hookform/resolvers/zod'
import { HttpUrlOptionalSchema } from '@root/schemas/common/url.schema'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { updateConfig, useConfig } from '@/hooks/useConfig'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { $api, apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

const maintainerrFormSchema = z.object({
  maintainerrUrl: HttpUrlOptionalSchema,
  maintainerrExclusionMode: z.enum(['watchlisters', 'global']),
})

// Saving or toggling kicks off a background reconcile server-side with no
// in-flight flag in the status payload, so poll briefly after either action.
// The window covers the reconciler's worst case (15s fetch timeout).
const RECONCILE_POLL_MS = 2000
const RECONCILE_POLL_WINDOW_MS = 20000

export type MaintainerrFormValues = z.infer<typeof maintainerrFormSchema>

export function useMaintainerr() {
  const { config } = useConfig()
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [pollUntil, setPollUntil] = useState<number | null>(null)

  const statusQuery = $api.useQuery(
    'get',
    '/v1/notifications/maintainerr/status',
    {},
    {
      refetchInterval: () =>
        pollUntil !== null && Date.now() < pollUntil
          ? RECONCILE_POLL_MS
          : false,
    },
  )
  const status = statusQuery.data?.result ?? null

  const form = useForm<MaintainerrFormValues>({
    resolver: zodResolver(maintainerrFormSchema),
    defaultValues: {
      maintainerrUrl: '',
      maintainerrExclusionMode: 'watchlisters',
    },
  })

  useEffect(() => {
    if (!config) return
    const values: MaintainerrFormValues = {
      maintainerrUrl: config.maintainerrUrl ?? '',
      maintainerrExclusionMode:
        config.maintainerrExclusionMode ?? 'watchlisters',
    }
    form.reset(values, { keepDirty: false })

    // Radix Select can miss a single reset on initial load - re-apply
    setTimeout(() => {
      if (
        form.getValues('maintainerrExclusionMode') !==
        values.maintainerrExclusionMode
      ) {
        form.setValue(
          'maintainerrExclusionMode',
          values.maintainerrExclusionMode,
          { shouldDirty: false },
        )
        form.reset(form.getValues(), { keepDirty: false })
      }
    }, 0)
  }, [config, form])

  const onSubmit = async (data: MaintainerrFormValues) => {
    setIsSaving(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )
      await Promise.all([updateConfig(data), minimumLoadingTime])
      form.reset(data, { keepDirty: false })
      toast.success('Maintainerr settings saved')
      setPollUntil(Date.now() + RECONCILE_POLL_WINDOW_MS)
    } catch (error) {
      toast.error(
        apiErrorMessage(error) ?? 'Failed to save Maintainerr settings',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = useCallback(() => {
    form.reset()
  }, [form])

  const handleToggle = useCallback(async (newEnabledState: boolean) => {
    setIsToggling(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )
      await Promise.all([
        updateConfig({ maintainerrEnabled: newEnabledState }),
        minimumLoadingTime,
      ])
      toast.success(
        `Maintainerr integration ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
      )
      setPollUntil(Date.now() + RECONCILE_POLL_WINDOW_MS)
    } catch (error) {
      toast.error(
        apiErrorMessage(error) ??
          `Failed to ${newEnabledState ? 'enable' : 'disable'} Maintainerr integration`,
      )
    } finally {
      setIsToggling(false)
    }
  }, [])

  const syncNow = useCallback(async () => {
    setIsSyncing(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )
      const [{ data, error }] = await Promise.all([
        apiFetch.POST('/v1/notifications/maintainerr/sync'),
        minimumLoadingTime,
      ])
      if (error) throw error

      await statusQuery.refetch()
      if (data.result?.status === 'ok') {
        toast.success('Maintainerr synced')
      } else {
        toast.error(data.result?.error ?? 'Maintainerr sync did not complete')
      }
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'Failed to sync Maintainerr')
    } finally {
      setIsSyncing(false)
    }
  }, [statusQuery])

  return {
    form,
    status,
    isEnabled: Boolean(config?.maintainerrEnabled),
    hasUrl: Boolean(config?.maintainerrUrl),
    isSaving,
    isSyncing,
    isToggling,
    onSubmit,
    handleCancel,
    handleToggle,
    syncNow,
  }
}
