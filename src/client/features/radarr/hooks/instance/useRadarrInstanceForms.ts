import { useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { UseRadarrInstanceFormProps } from '@/features/radarr/types/types'
import {
  initialInstanceSchema,
  fullInstanceSchema,
  type RadarrInstanceSchema,
} from '@/features/radarr/store/schemas'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * React hook for managing a Radarr instance configuration form with validation, state synchronization, and connection tracking.
 *
 * Integrates `react-hook-form` and Zod schemas to handle both new and existing Radarr instances. Initializes form values from the provided instance, updates form state based on connection validation, and manages internal fields to track whether connection credentials have changed and require re-testing. Provides utilities for resetting the form, updating the title, and handling connection validation changes.
 *
 * @returns An object containing the form instance, a ref to the form container element, and utility callbacks for form management.
 */
export function useRadarrInstanceForm({
  instance,
  instances,
  isNew = false,
  isConnectionValid,
}: UseRadarrInstanceFormProps) {
  const form = useForm<RadarrInstanceSchema>({
    resolver: zodResolver(isNew ? initialInstanceSchema : fullInstanceSchema),
    defaultValues: {
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile || '',
      rootFolder: instance.rootFolder || '',
      bypassIgnored: instance.bypassIgnored,
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      minimumAvailability: instance.minimumAvailability || 'released',
      tags: instance.tags,
      isDefault: isNew
        ? instances.length === 1 && instances[0].apiKey === API_KEY_PLACEHOLDER
        : instance.isDefault,
      syncedInstances: instance.syncedInstances || [],
      _originalBaseUrl: instance.baseUrl,
      _originalApiKey: instance.apiKey,
    },
    mode: 'all',
  })
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isNew) {
      form.trigger()
    }
  }, [form, isNew])

  useEffect(() => {
    form.reset({
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile || '',
      rootFolder: instance.rootFolder || '',
      bypassIgnored: instance.bypassIgnored,
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      minimumAvailability: instance.minimumAvailability || 'released',
      tags: instance.tags,
      isDefault: instance.isDefault,
      syncedInstances: instance.syncedInstances || [],
      _originalBaseUrl: instance.baseUrl,
      _originalApiKey: instance.apiKey,
    })

    if (isConnectionValid) {
      const values = form.getValues()
      const hasPlaceholderValues =
        !values.qualityProfile ||
        !values.rootFolder ||
        values.qualityProfile === '' ||
        values.rootFolder === ''

      if (hasPlaceholderValues) {
        form.clearErrors()
        form.trigger(['qualityProfile', 'rootFolder'])
        form.setValue('qualityProfile', values.qualityProfile || '', {
          shouldTouch: true,
          shouldValidate: true,
        })
        form.setValue('rootFolder', values.rootFolder || '', {
          shouldTouch: true,
          shouldValidate: true,
        })
      }
    }
  }, [instance, form, isConnectionValid])

  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [isNew])

  const handleConnectionValidationChange = useCallback(() => {
    if (isConnectionValid) {
      const values = form.getValues()
      form.clearErrors()
      form.trigger(['qualityProfile', 'rootFolder'])
      form.setValue('qualityProfile', values.qualityProfile || '', {
        shouldTouch: true,
        shouldValidate: true,
        shouldDirty: true,
      })
      form.setValue('rootFolder', values.rootFolder || '', {
        shouldTouch: true,
        shouldValidate: true,
        shouldDirty: true,
      })
    }
  }, [form, isConnectionValid])

  const resetForm = useCallback(
    (data?: RadarrInstanceSchema) => {
      if (data) {
        form.reset({
          ...data,
          _originalBaseUrl: instance.baseUrl,
          _originalApiKey: instance.apiKey,
        })
      } else {
        form.reset({
          name: instance.name,
          baseUrl: instance.baseUrl,
          apiKey: instance.apiKey,
          qualityProfile: instance.qualityProfile || '',
          rootFolder: instance.rootFolder || '',
          bypassIgnored: instance.bypassIgnored,
          searchOnAdd:
            instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
          minimumAvailability: instance.minimumAvailability || 'released',
          tags: instance.tags,
          isDefault: instance.isDefault,
          syncedInstances: instance.syncedInstances || [],
          _originalBaseUrl: instance.baseUrl,
          _originalApiKey: instance.apiKey,
        })
      }

      if (
        isConnectionValid &&
        (!instance.qualityProfile || !instance.rootFolder)
      ) {
        form.trigger(['qualityProfile', 'rootFolder'])
      }
    },
    [form, instance, isConnectionValid],
  )

  const setTitleValue = useCallback(
    (title: string) => {
      form.setValue('name', title, { shouldDirty: true })
    },
    [form],
  )

  useEffect(() => {
    const subscription = form.watch((formValues, { name }) => {
      if (name === 'baseUrl' || name === 'apiKey') {
        const origBaseUrl = form.getValues('_originalBaseUrl')
        const origApiKey = form.getValues('_originalApiKey')

        if (
          (name === 'baseUrl' && formValues.baseUrl !== origBaseUrl) ||
          (name === 'apiKey' && formValues.apiKey !== origApiKey)
        ) {
          form.setValue('_connectionTested', false)
        } else if (
          formValues.baseUrl === origBaseUrl &&
          formValues.apiKey === origApiKey
        ) {
          form.setValue('_connectionTested', true)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [form])

  return {
    form,
    cardRef,
    resetForm,
    handleConnectionValidationChange,
    setTitleValue,
  }
}
