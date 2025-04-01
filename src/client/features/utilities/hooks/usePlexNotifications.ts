import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { z } from 'zod'
import type {
  PlexNotificationConfig,
  PlexNotificationResponse,
} from '@root/schemas/plex/configure-notifications.schema'
import type { PlexNotificationStatusResponse } from '@root/schemas/plex/get-notification-status.schema'

const plexNotificationsSchema = z.object({
  plexToken: z.string().min(1, 'Plex token is required'),
  plexHost: z.string().min(1, 'Plex host is required'),
  plexPort: z.coerce.number().int().positive().default(32400),
  useSsl: z.boolean().default(false),
})

export type PlexNotificationsFormValues = PlexNotificationConfig

/**
 * Custom hook to handle Plex notifications form state and operations.
 *
 * This hook manages the form for Plex notification configuration across Radarr and Sonarr instances.
 * It handles form validation, submission, cancellation, and deletion of the configuration.
 * The hook communicates with the server endpoints to configure or remove Plex notifications.
 *
 * @returns An object containing:
 * - form: The React Hook Form instance.
 * - error: Any error encountered during operations.
 * - isSubmitting: Boolean indicating if the form is being submitted.
 * - isDeleting: Boolean indicating if the configuration is being deleted.
 * - isLoading: Boolean indicating if the status is being loaded.
 * - onSubmit: Function to handle form submission.
 * - handleCancel: Function to reset the form to its default values.
 * - handleDelete: Function to delete the configuration.
 * - initiateDelete: Function to start the delete confirmation flow.
 * - lastResults: The results from the last successful operation.
 */
export function usePlexNotifications() {
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastResults, setLastResults] = useState<
    PlexNotificationResponse | PlexNotificationStatusResponse | null
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

  // Fetch current notification status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/v1/plex/notification-status')

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.error || 'Failed to fetch Plex notification status',
          )
        }

        const results: PlexNotificationStatusResponse = await response.json()
        setLastResults(results)
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
  }, [])

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PlexNotificationsFormValues) => {
      setIsSubmitting(true)
      setError(null)

      try {
        // Send the request to configure Plex notifications
        const response = await fetch('/v1/plex/configure-notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        })

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
      // Send the request to remove Plex notifications
      const response = await fetch('/v1/plex/remove-notifications', {
        method: 'DELETE',
      })

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

  // Function to prepare for deletion (typically used with confirmation modal)
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
