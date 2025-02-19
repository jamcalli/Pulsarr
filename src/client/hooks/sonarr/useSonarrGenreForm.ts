import { useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SonarrInstance } from '@/stores/sonarrStore'
import type { GenreRoute } from '@/types/sonarr/types'
import { genreRouteSchema, GenreRouteFormValues } from '@/types/sonarr/schemas'

export interface UseSonarrGenreFormProps {
  route: GenreRoute
  isNew?: boolean
  onGenreDropdownOpen: () => Promise<void>
}

const useSonarrGenreForm = ({ 
  route, 
  isNew = false,
  onGenreDropdownOpen 
}: UseSonarrGenreFormProps) => {
  const hasInitialized = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const form = useForm<GenreRouteFormValues>({
    resolver: zodResolver(genreRouteSchema),
    defaultValues: {
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
      qualityProfile: route.qualityProfile || '', 
    },
    mode: 'all'
  })

  const resetForm = useCallback(() => {
    form.reset({
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
      qualityProfile: route.qualityProfile || '', 
    })

    if (!route.qualityProfile) {
      form.trigger('qualityProfile')
    }
  }, [form, route])

  const setTitleValue = useCallback((title: string) => {
    form.setValue('name', title, { shouldDirty: true })
  }, [form])

  const handleInstanceChange = useCallback((value: string) => {
    const instanceId = Number.parseInt(value)
    form.setValue('sonarrInstanceId', instanceId)
    form.setValue('rootFolder', '', { shouldDirty: true })
    form.setValue('qualityProfile', '', { 
      shouldDirty: true,
      shouldValidate: true 
    })
  }, [form])

  // Initialize component and fetch genres if needed
  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      if (!isNew) {
        await onGenreDropdownOpen()
      }
    }

    initializeComponent()
  }, [isNew, onGenreDropdownOpen])
  
  // Add scroll effect
  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'nearest'
      })
    }
  }, [isNew])

  // Reset form only when the route ID changes
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      return
    }

    // Only reset if we have a valid ID and it changes
    if (route.id) {
      resetForm()
    }
  }, [route.id, resetForm]) 

  // Trigger validation for new routes
  useEffect(() => {
    if (isNew) {
      form.trigger()
    }
  }, [form, isNew])

  const getSelectedInstance = useCallback((instances: SonarrInstance[]) => {
    return instances.find((inst) => inst.id === form.watch('sonarrInstanceId'))
  }, [form])

  return {
    form,
    cardRef,
    resetForm,
    setTitleValue,
    handleInstanceChange,
    getSelectedInstance,
    hasInitialized: hasInitialized.current
  }
}

export default useSonarrGenreForm