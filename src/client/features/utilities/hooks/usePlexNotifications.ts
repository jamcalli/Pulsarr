import { zodResolver } from '@hookform/resolvers/zod'
import {
  PlexNotificationConfigSchema,
  type PlexNotificationResponse,
} from '@root/schemas/plex/configure-notifications.schema'
import type { PlexNotificationStatusResponse } from '@root/schemas/plex/get-notification-status.schema'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import { useConfigStore } from '@/stores/configStore'

export type PlexNotificationsFormValues = z.input<
  typeof PlexNotificationConfigSchema
>

/**
 * React hook for managing Plex notifications configuration via a form.
 *
 * Initializes and validates the Plex notifications form, fetches current configuration from the server, and provides handlers for submitting, canceling, and deleting the configuration. Manages loading, submission, and error states, and exposes the latest server response data.
 *
 * @returns An object containing the form instance, error message, loading and submission states, handlers for submitting, canceling, and deleting the configuration, a placeholder for initiating deletion, and the latest server response data.
 */
export function usePlexNotifications() {
  const config = useConfigStore((state) => state.config)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastResults, setLastResults] = useState<
    PlexNotificationResponse | PlexNotificationStatusResponse | null
  >(null)

  // Initialize form with default values
  const form = useForm<z.input<typeof PlexNotificationConfigSchema>>({
    resolver: zodResolver(PlexNotificationConfigSchema),
    defaultValues: {
      plexToken: '',
      plexHost: '',
      plexPort: 32400,
      useSsl: false,
    },
  })

  // Populate Plex token from config store when config changes
  useEffect(() => {
    const token = config?.plexTokens?.[0] || ''
    // reset (unlike resetField) works before fields register, and it puts the
    // token in the reset baseline so cancel doesn't clear it
    form.reset(
      { ...form.getValues(), plexToken: token },
      { keepDirtyValues: true },
    )
  }, [config?.plexTokens, form])

  // Function to fetch current notification status
  const fetchCurrentStatus = useCallback(async () => {
    // Don't show loading state for status refresh after delete
    const controller = new AbortController()
    const signal = controller.signal

    // Add a timeout to prevent hanging
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const { data: results, error: fetchError } = await apiFetch.GET(
        '/v1/plex/notification-status',
        { signal },
      )
      if (fetchError) throw fetchError

      setLastResults(results)
    } catch (error) {
      // Just log the error, don't show to user since this is a background refresh
      console.error('Error fetching notification status after deletion:', error)
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  // Fetch current notification status on mount
  useEffect(() => {
    // Create an AbortController to handle cleanup
    const abortController = new AbortController()
    const signal = abortController.signal

    const fetchStatus = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Wait for both the response and the minimum loading time
        const [{ data: results, error: fetchError }] = await Promise.all([
          apiFetch.GET('/v1/plex/notification-status', { signal }),
          minimumLoadingTime,
        ])

        // Check if the request was aborted before setting state
        if (signal.aborted) return
        if (fetchError) throw fetchError

        setLastResults(results)
      } catch (err) {
        // Don't update state if the request was aborted or component unmounted
        if (signal.aborted) return

        const errorMessage =
          apiErrorMessage(err) ?? 'Failed to fetch Plex notification status'

        setError(errorMessage)
      } finally {
        // Don't update state if the request was aborted or component unmounted
        if (!signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchStatus()

    return () => {
      abortController.abort()
    }
  }, [])

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PlexNotificationsFormValues) => {
      setIsSubmitting(true)
      setError(null)

      // Create an AbortController for the timeout
      const controller = new AbortController()
      const signal = controller.signal

      // Set a timeout to abort the request after 5 seconds
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        // Transform form data to ensure proper types for backend
        const transformedData = PlexNotificationConfigSchema.parse(data)

        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Wait for both the response and the minimum loading time
        const [{ data: results, error: fetchError }] = await Promise.all([
          apiFetch.POST('/v1/plex/configure-notifications', {
            body: transformedData,
            signal,
          }),
          minimumLoadingTime,
        ])
        if (fetchError) throw fetchError

        setLastResults(results)

        if (results.success) {
          toast.success(results.message)
        } else {
          toast.error(results.message)
        }

        // If the operation was successful, mark the form as pristine
        if (results.success) {
          form.reset(data)
        }
      } catch (err) {
        // Handle timeout specifically
        if (err instanceof DOMException && err.name === 'AbortError') {
          const timeoutError =
            'Request timed out. Please check your Plex server connection and try again.'
          setError(timeoutError)

          toast.error(timeoutError)
        } else {
          // Handle other errors
          const errorMessage =
            apiErrorMessage(err) ?? 'Failed to configure Plex notifications'

          setError(errorMessage)

          toast.error(errorMessage)
        }
      } finally {
        clearTimeout(timeoutId)
        setIsSubmitting(false)
      }
    },
    [form],
  )

  // Handle form cancellation - discard edits back to the last saved values
  const handleCancel = useCallback(() => {
    form.reset()
  }, [form])

  // Handle deletion of Plex notifications
  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    // Create an AbortController for the timeout
    const controller = new AbortController()
    const signal = controller.signal

    // Set a timeout to abort the request after 5 seconds
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      // Wait for both the response and the minimum loading time
      const [{ data: results, error: fetchError }] = await Promise.all([
        apiFetch.DELETE('/v1/plex/remove-notifications', { signal }),
        minimumLoadingTime,
      ])
      if (fetchError) throw fetchError

      setLastResults(results)

      if (results.success) {
        toast.success(results.message)
      } else {
        toast.error(results.message)
      }

      // After successful removal, fetch the current status to update UI
      await fetchCurrentStatus()
    } catch (err) {
      // Handle timeout specifically
      if (err instanceof DOMException && err.name === 'AbortError') {
        const timeoutError =
          'Request timed out. Please check your Plex server connection and try again.'
        setError(timeoutError)

        toast.error(timeoutError)
      } else {
        // Handle other errors
        const errorMessage =
          apiErrorMessage(err) ?? 'Failed to remove Plex notifications'

        setError(errorMessage)

        toast.error(errorMessage)
      }
    } finally {
      clearTimeout(timeoutId)
      setIsDeleting(false)
    }
  }, [fetchCurrentStatus])

  const initiateDelete = useCallback(() => {
    // This function is just a placeholder for the action of clicking the delete button
    // The actual deletion happens in handleDelete
  }, [])

  return {
    form,
    error,
    isSubmitting,
    isDeleting,
    isLoading,
    onSubmit,
    handleCancel,
    handleDelete,
    initiateDelete,
    lastResults,
  }
}
