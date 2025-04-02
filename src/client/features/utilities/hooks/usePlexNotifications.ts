import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { z } from 'zod'
import { useConfigStore } from '@/stores/configStore'
import type { PlexNotificationResponse } from '@root/schemas/plex/configure-notifications.schema'
import type { PlexNotificationStatusResponse } from '@root/schemas/plex/get-notification-status.schema'

// Minimum loading delay
const MIN_LOADING_DELAY = 500

// Extended status response type with config
interface ExtendedPlexNotificationStatusResponse
  extends PlexNotificationStatusResponse {
  config?: {
    plexToken?: string
    plexHost?: string
    plexPort?: number
    useSsl?: boolean
  }
}

// Schema for the form
const plexNotificationsSchema = z.object({
  plexToken: z.string().optional(),
  plexHost: z.string().min(1, 'Plex host is required'),
  plexPort: z.coerce.number().int().positive().default(32400),
  useSsl: z.boolean().default(false),
})

export type PlexNotificationsFormValues = z.infer<
  typeof plexNotificationsSchema
>

/**
 * Custom React hook for managing the form and state related to Plex notifications configuration.
 *
 * This hook handles initialization, validation, submission, cancellation, and deletion of the Plex
 * notifications configuration. It fetches the current notification status on mount and updates the
 * form with any existing settings. Additionally, it communicates with server endpoints to configure
 * or remove Plex notifications while managing related loading and error states.
 *
 * @returns An object containing:
 * - form: The React Hook Form instance managing the form state.
 * - error: A string describing any error encountered during an operation.
 * - isSubmitting: Boolean indicating whether the form is currently being submitted.
 * - isDeleting: Boolean indicating whether a deletion operation is in progress.
 * - isLoading: Boolean indicating whether the configuration status is being loaded.
 * - onSubmit: Function to handle the form submission.
 * - handleCancel: Function to reset the form to its default values.
 * - handleDelete: Function to delete the Plex notifications configuration.
 * - initiateDelete: Function to trigger the delete confirmation flow.
 * - lastResults: The response data from the last successful operation.
 */
export function usePlexNotifications() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastResults, setLastResults] = useState<
    PlexNotificationResponse | ExtendedPlexNotificationStatusResponse | null
  >(null)

  // Initialize form with default values
  const form = useForm<PlexNotificationsFormValues>({
    resolver: zodResolver(plexNotificationsSchema),
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
    form.setValue('plexToken', token)
  }, [config, form])

  // Fetch current notification status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch
        const responsePromise = fetch('/v1/plex/notification-status')

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.error || 'Failed to fetch Plex notification status',
          )
        }

        const results =
          (await response.json()) as ExtendedPlexNotificationStatusResponse
        setLastResults(results)

        // If we have current settings, populate the form
        if (results.success && results.config) {
          form.reset({
            plexToken:
              results.config.plexToken || config?.plexTokens?.[0] || '',
            plexHost: results.config.plexHost || '',
            plexPort: results.config.plexPort || 32400,
            useSsl: results.config.useSsl || false,
          })
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to fetch Plex notification status'

        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
  }, [form, config])

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PlexNotificationsFormValues) => {
      setIsSubmitting(true)
      setError(null)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Send the request to configure Plex notifications
        const responsePromise = fetch('/v1/plex/configure-notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.error || 'Failed to configure Plex notifications',
          )
        }

        const results: PlexNotificationResponse = await response.json()
        setLastResults(results)

        toast({
          description: results.message,
          variant: results.success ? 'default' : 'destructive',
        })

        // If the operation was successful, mark the form as pristine
        if (results.success) {
          form.reset(data)
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to configure Plex notifications'

        setError(errorMessage)

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [toast, form],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    form.reset()
  }, [form])

  // Handle deletion of Plex notifications
  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      // Send the request to remove Plex notifications
      const responsePromise = fetch('/v1/plex/remove-notifications', {
        method: 'DELETE',
      })

      // Wait for both the response and the minimum loading time
      const [response] = await Promise.all([
        responsePromise,
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error || 'Failed to remove Plex notifications',
        )
      }

      const results: PlexNotificationResponse = await response.json()
      setLastResults(results)

      toast({
        description: results.message,
        variant: results.success ? 'default' : 'destructive',
      })
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to remove Plex notifications'

      setError(errorMessage)

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }, [toast])

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
