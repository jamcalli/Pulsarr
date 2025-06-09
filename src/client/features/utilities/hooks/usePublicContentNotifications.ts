import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { ConfigSchema } from '@root/schemas/config/config.schema'
import {
  WebhookValidationRequestSchema,
  type WebhookValidationResponse,
} from '@root/schemas/notifications/discord-control.schema'

// Extract the public content notifications schema from the main config schema
const publicContentNotificationsSchema =
  ConfigSchema.shape.publicContentNotifications.unwrap()

export type PublicContentNotificationsFormValues = z.infer<
  typeof publicContentNotificationsSchema
>

interface TestStatus {
  isTestingGeneral: boolean
  isTestingMovies: boolean
  isTestingShows: boolean
  testResults: {
    general: boolean | null
    movies: boolean | null
    shows: boolean | null
  }
}

/**
 * React hook for managing public content notifications configuration.
 *
 * Provides form state, validation, test connection functionality, and handlers for submitting and canceling configuration changes. Manages loading states for form submission and webhook testing operations, and integrates with the config store for persistence.
 *
 * @returns An object containing the form instance, loading states, test status, handlers for form operations and webhook testing, and configuration management functions.
 */
export function usePublicContentNotifications() {
  const { toast } = useToast()
  const { config, updateConfig } = useConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({
    isTestingGeneral: false,
    isTestingMovies: false,
    isTestingShows: false,
    testResults: {
      general: null,
      movies: null,
      shows: null,
    },
  })

  // Initialize form with default values
  const form = useForm<PublicContentNotificationsFormValues>({
    resolver: zodResolver(publicContentNotificationsSchema),
    defaultValues: {
      enabled: config?.publicContentNotifications?.enabled || false,
      discordWebhookUrls:
        config?.publicContentNotifications?.discordWebhookUrls || '',
      discordWebhookUrlsMovies:
        config?.publicContentNotifications?.discordWebhookUrlsMovies || '',
      discordWebhookUrlsShows:
        config?.publicContentNotifications?.discordWebhookUrlsShows || '',
      appriseUrls: config?.publicContentNotifications?.appriseUrls || '',
      appriseUrlsMovies:
        config?.publicContentNotifications?.appriseUrlsMovies || '',
      appriseUrlsShows:
        config?.publicContentNotifications?.appriseUrlsShows || '',
    },
  })

  // Update form when config changes
  useEffect(() => {
    if (config?.publicContentNotifications) {
      const formValues = {
        enabled: config.publicContentNotifications.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications.appriseUrlsShows || '',
      }
      form.reset(formValues)
    }
  }, [config, form])

  // Helper function to validate Discord webhook URL using route schema
  const validateDiscordWebhook = useCallback(
    async (url: string): Promise<WebhookValidationResponse> => {
      if (!url.trim()) {
        return {
          success: false,
          valid: false,
          urls: [],
          message: 'No webhook URL provided',
        }
      }

      try {
        // Validate the request payload with the schema
        const requestData = WebhookValidationRequestSchema.parse({
          webhookUrls: url,
        })

        const response = await fetch(
          '/v1/notifications/validate-discord-webhooks',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
          },
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to validate webhook')
        }

        const result: WebhookValidationResponse = await response.json()
        return result
      } catch (error) {
        console.error('Webhook validation error:', error)
        return {
          success: false,
          valid: false,
          urls: [],
          message:
            error instanceof Error
              ? error.message
              : 'Failed to validate webhook',
        }
      }
    },
    [],
  )

  // Handle Discord webhook testing
  const handleTestDiscordWebhook = useCallback(
    async (type: 'general' | 'movies' | 'shows') => {
      const urlField =
        type === 'general'
          ? 'discordWebhookUrls'
          : type === 'movies'
            ? 'discordWebhookUrlsMovies'
            : 'discordWebhookUrlsShows'

      const testingField =
        type === 'general'
          ? 'isTestingGeneral'
          : type === 'movies'
            ? 'isTestingMovies'
            : 'isTestingShows'

      const url = form.getValues(urlField)

      if (!url?.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter a webhook URL first',
          variant: 'destructive',
        })
        return
      }

      setTestStatus((prev) => ({
        ...prev,
        [testingField]: true,
        testResults: {
          ...prev.testResults,
          [type]: null,
        },
      }))

      try {
        const result = await validateDiscordWebhook(url)

        setTestStatus((prev) => ({
          ...prev,
          testResults: {
            ...prev.testResults,
            [type]: result.valid,
          },
        }))

        if (result.valid) {
          const webhookCount = result.urls.length
          let countText =
            webhookCount === 1
              ? 'Discord webhook URL is valid!'
              : `All ${webhookCount} Discord webhook URLs are valid!`

          if (result.duplicateCount && result.duplicateCount > 0) {
            countText += ` (${result.duplicateCount} duplicate ${
              result.duplicateCount === 1 ? 'URL was' : 'URLs were'
            } removed)`
          }

          toast({
            title: 'Success',
            description: countText,
            variant: 'default',
          })
        } else {
          toast({
            title: 'Error',
            description: result.message || 'Discord webhook validation failed',
            variant: 'destructive',
          })
        }
      } catch (error) {
        setTestStatus((prev) => ({
          ...prev,
          testResults: {
            ...prev.testResults,
            [type]: false,
          },
        }))

        toast({
          title: 'Error',
          description:
            error instanceof Error
              ? error.message
              : 'Failed to test Discord webhook connection',
          variant: 'destructive',
        })
      } finally {
        setTestStatus((prev) => ({
          ...prev,
          [testingField]: false,
        }))
      }
    },
    [form, toast, validateDiscordWebhook],
  )

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PublicContentNotificationsFormValues) => {
      setIsSubmitting(true)

      try {
        await updateConfig({
          publicContentNotifications: data,
        })

        toast({
          description:
            'Public content notifications settings saved successfully',
          variant: 'default',
        })

        // Reset form with updated data
        form.reset(data)
      } catch (error) {
        console.error('Failed to save public content notifications:', error)

        toast({
          title: 'Error',
          description: 'Failed to save public content notifications settings',
          variant: 'destructive',
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [updateConfig, toast, form],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (config?.publicContentNotifications) {
      const formValues = {
        enabled: config.publicContentNotifications.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications.appriseUrlsShows || '',
      }
      form.reset(formValues)
    }
  }, [config, form])

  return {
    form,
    isSubmitting,
    testStatus,
    onSubmit,
    handleCancel,
    handleTestDiscordWebhook,
  }
}
