import { zodResolver } from '@hookform/resolvers/zod'
import {
  CreateWebhookEndpointSchema,
  type WebhookEndpoint,
  type WebhookEventTypeValue,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useTestExistingWebhookEndpoint,
  useTestWebhookEndpoint,
  useUpdateWebhookEndpoint,
} from './useWebhookEndpointMutations'
import { useWebhookEndpointsQuery } from './useWebhookEndpointsQuery'

// Form schema with connection test validation (follows Tautulli pattern)
const WebhookEndpointFormSchema = CreateWebhookEndpointSchema.extend({
  enabled: z.boolean(),
  // Internal fields for tracking connection test state
  _connectionTested: z.boolean().optional(),
  _originalUrl: z.string().optional(),
  _originalAuthHeaderName: z.string().optional(),
  _originalAuthHeaderValue: z.string().optional(),
}).superRefine((data, ctx) => {
  // If URL is provided, check if connection has been tested
  if (data.url) {
    const hasChangedConnectionSettings =
      (data._originalUrl !== undefined && data._originalUrl !== data.url) ||
      (data._originalAuthHeaderName !== undefined &&
        data._originalAuthHeaderName !== (data.authHeaderName ?? '')) ||
      (data._originalAuthHeaderValue !== undefined &&
        data._originalAuthHeaderValue !== (data.authHeaderValue ?? ''))

    // Require test if: new endpoint (no originals) OR connection settings changed
    if (
      !data._connectionTested &&
      (data._originalUrl === undefined || hasChangedConnectionSettings)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Please test connection before saving',
        path: ['url'],
      })
    }
  }
})

export interface WebhookEndpointFormValues {
  name: string
  url: string
  authHeaderName?: string
  authHeaderValue?: string
  eventTypes: WebhookEventTypeValue[]
  enabled: boolean
  // Internal fields
  _connectionTested?: boolean
  _originalUrl?: string
  _originalAuthHeaderName?: string
  _originalAuthHeaderValue?: string
}

export function useWebhookEndpoints() {
  // React Query hooks
  const {
    data: endpoints = [],
    isLoading: isFetchLoading,
    error: fetchError,
  } = useWebhookEndpointsQuery()

  const createMutation = useCreateWebhookEndpoint()
  const updateMutation = useUpdateWebhookEndpoint()
  const deleteMutation = useDeleteWebhookEndpoint()
  const testMutation = useTestWebhookEndpoint()
  const testExistingMutation = useTestExistingWebhookEndpoint()

  // UI state
  const [editingEndpoint, setEditingEndpoint] =
    useState<WebhookEndpoint | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [connectionTested, setConnectionTested] = useState(false)
  const [testedEndpoints, setTestedEndpoints] = useState<
    Record<number, boolean>
  >({})
  const [deleteEndpointId, setDeleteEndpointId] = useState<number | null>(null)

  const form = useForm<WebhookEndpointFormValues>({
    resolver: zodResolver(WebhookEndpointFormSchema),
    defaultValues: {
      name: '',
      url: '',
      authHeaderName: '',
      authHeaderValue: '',
      eventTypes: [],
      enabled: true,
      _connectionTested: false,
      _originalUrl: undefined,
      _originalAuthHeaderName: undefined,
      _originalAuthHeaderValue: undefined,
    },
    mode: 'onTouched',
  })

  // Reset test state when URL or auth fields change, restore if reverted to original
  useEffect(() => {
    const subscription = form.watch((formValues, { name }) => {
      if (
        name === 'url' ||
        name === 'authHeaderName' ||
        name === 'authHeaderValue'
      ) {
        const origUrl = form.getValues('_originalUrl')
        const origAuthName = form.getValues('_originalAuthHeaderName')
        const origAuthValue = form.getValues('_originalAuthHeaderValue')

        const currentUrl = formValues.url
        const currentAuthName = formValues.authHeaderName ?? ''
        const currentAuthValue = formValues.authHeaderValue ?? ''

        // Check if any connection-related field differs from original
        const hasChanged =
          currentUrl !== origUrl ||
          currentAuthName !== origAuthName ||
          currentAuthValue !== origAuthValue

        if (hasChanged) {
          form.setValue('_connectionTested', false)
          setConnectionTested(false)
        } else if (origUrl !== undefined) {
          // Reverted to original saved values
          form.setValue('_connectionTested', true)
          setConnectionTested(true)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  const resetForm = useCallback(() => {
    form.reset({
      name: '',
      url: '',
      authHeaderName: '',
      authHeaderValue: '',
      eventTypes: [],
      enabled: true,
      _connectionTested: false,
      _originalUrl: undefined,
      _originalAuthHeaderName: undefined,
      _originalAuthHeaderValue: undefined,
    })
    setConnectionTested(false)
    setEditingEndpoint(null)
    // Reset mutation states
    testMutation.reset()
    createMutation.reset()
    updateMutation.reset()
  }, [form, testMutation, createMutation, updateMutation])

  const openCreateModal = useCallback(() => {
    resetForm()
    setIsModalOpen(true)
  }, [resetForm])

  const openEditModal = useCallback(
    (endpoint: WebhookEndpoint) => {
      setEditingEndpoint(endpoint)
      form.reset({
        name: endpoint.name,
        url: endpoint.url,
        authHeaderName: endpoint.authHeaderName ?? '',
        authHeaderValue: endpoint.authHeaderValue ?? '',
        eventTypes: endpoint.eventTypes,
        enabled: endpoint.enabled,
        // Track original values for change detection
        _connectionTested: true,
        _originalUrl: endpoint.url,
        _originalAuthHeaderName: endpoint.authHeaderName ?? '',
        _originalAuthHeaderValue: endpoint.authHeaderValue ?? '',
      })
      // Already saved = already tested (URL hasn't changed)
      setConnectionTested(true)
      setIsModalOpen(true)
    },
    [form],
  )

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    // Small delay to let modal animation complete before resetting
    setTimeout(() => {
      resetForm()
    }, 150)
  }, [resetForm])

  const handleTest = useCallback(async () => {
    const values = form.getValues()

    if (!values.url) {
      toast.error('Please enter a webhook URL to test')
      return null
    }

    try {
      const result = await testMutation.mutateAsync({
        url: values.url,
        authHeaderName: values.authHeaderName || undefined,
        authHeaderValue: values.authHeaderValue || undefined,
        name: values.name || undefined,
      })

      if (result.success) {
        setConnectionTested(true)
        form.setValue('_connectionTested', true, { shouldValidate: true })
        form.clearErrors('url')
        toast.success(`Connection successful (${result.responseTime}ms)`)
      } else {
        setConnectionTested(false)
        form.setValue('_connectionTested', false, { shouldValidate: true })
        toast.error(result.error || 'Connection test failed')
      }

      return result
    } catch (error) {
      setConnectionTested(false)
      form.setValue('_connectionTested', false, { shouldValidate: true })
      console.error('Failed to test webhook endpoint:', error)
      return null
    }
  }, [form, testMutation])

  const handleSubmit = useCallback(
    async (data: WebhookEndpointFormValues) => {
      try {
        if (editingEndpoint) {
          await updateMutation.mutateAsync({
            id: editingEndpoint.id,
            data: {
              name: data.name,
              url: data.url,
              authHeaderName: data.authHeaderName || null,
              authHeaderValue: data.authHeaderValue || null,
              eventTypes: data.eventTypes,
              enabled: data.enabled,
            },
          })
          toast.success('Webhook endpoint updated')
        } else {
          await createMutation.mutateAsync(data)
          toast.success('Webhook endpoint created')
        }

        // Close modal after success
        setTimeout(() => {
          closeModal()
        }, 1000)
      } catch (error) {
        // Error is already handled by apiClient and React Query
        console.error('Failed to save webhook endpoint:', error)
      }
    },
    [editingEndpoint, updateMutation, createMutation, closeModal],
  )

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteMutation.mutateAsync(id)
        toast.success('Webhook endpoint deleted')
        setDeleteEndpointId(null)
      } catch (error) {
        console.error('Failed to delete webhook endpoint:', error)
      }
    },
    [deleteMutation],
  )

  const openDeleteModal = useCallback((id: number) => {
    setDeleteEndpointId(id)
  }, [])

  const closeDeleteModal = useCallback(() => {
    setDeleteEndpointId(null)
  }, [])

  const handleTestExisting = useCallback(
    async (id: number) => {
      try {
        const result = await testExistingMutation.mutateAsync(id)

        if (result.success) {
          toast.success(`Connection successful (${result.responseTime}ms)`)
          setTestedEndpoints((prev) => ({ ...prev, [id]: true }))
          // Reset after 3 seconds
          setTimeout(() => {
            setTestedEndpoints((prev) => ({ ...prev, [id]: false }))
          }, 3000)
        } else {
          toast.error(result.error || 'Connection test failed')
        }

        return result
      } catch (error) {
        console.error('Failed to test webhook endpoint:', error)
        return null
      }
    },
    [testExistingMutation],
  )

  return {
    // Data state (React Query)
    endpoints,
    isLoading: isFetchLoading,
    error: fetchError,

    // Mutations (React Query)
    createMutation,
    updateMutation,
    deleteMutation,
    testMutation,
    testExistingMutation,

    // Form
    form,
    connectionTested,
    testedEndpoints,

    // Modal state
    editingEndpoint,
    isModalOpen,
    deleteEndpointId,

    // Actions
    openCreateModal,
    openEditModal,
    closeModal,
    handleTest,
    handleTestExisting,
    handleSubmit,
    handleDelete,
    openDeleteModal,
    closeDeleteModal,
  }
}
