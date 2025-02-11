import { useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { RadarrInstance } from '@/stores/radarrStore'
import type { GenreRoute } from '@/types/radarr/types'
import { genreRouteSchema, GenreRouteFormValues } from '@/types/radarr/schemas'

export interface UseRadarrGenreFormProps {
  route: GenreRoute
  isNew?: boolean
  onGenreDropdownOpen: () => Promise<void>
}

const useRadarrGenreForm = ({ 
    route, 
    isNew = false,
    onGenreDropdownOpen 
  }: UseRadarrGenreFormProps) => {
    const hasInitialized = useRef(false)
    const cardRef = useRef<HTMLDivElement>(null)
  
    const form = useForm<GenreRouteFormValues>({
      resolver: zodResolver(genreRouteSchema),
      defaultValues: {
        name: route.name,
        genre: route.genre,
        radarrInstanceId: route.radarrInstanceId,
        rootFolder: route.rootFolder,
      },
      mode: 'all'
    })
  
    const resetForm = useCallback(() => {
      form.reset({
        name: route.name,
        genre: route.genre,
        radarrInstanceId: route.radarrInstanceId,
        rootFolder: route.rootFolder,
      })
    }, [form, route])
  
    const setTitleValue = useCallback((title: string) => {
      form.setValue('name', title, { shouldDirty: true })
    }, [form])
  
    const handleInstanceChange = useCallback((value: string) => {
      const instanceId = Number.parseInt(value)
      form.setValue('radarrInstanceId', instanceId)
      form.setValue('rootFolder', '', { shouldDirty: true })
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
  
    const getSelectedInstance = useCallback((instances: RadarrInstance[]) => {
      return instances.find((inst) => inst.id === form.watch('radarrInstanceId'))
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

  export default useRadarrGenreForm