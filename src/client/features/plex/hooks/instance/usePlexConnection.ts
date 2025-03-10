import { useState, useCallback, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { usePlexStore } from '@/features/plex/store/plexStore'
import type { ConnectionStatus } from '@/features/plex/store/types'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

export function usePlexConnection() {
  const { toast } = useToast()
  const [testStatus, setTestStatus] = useState<ConnectionStatus>('idle')
  const [saveStatus, setSaveStatus] = useState<ConnectionStatus>('idle')
  const hasInitialized = useRef(false)
  
  const updateConfig = usePlexStore((state) => state.updateConfig)
  const fetchUserData = usePlexStore((state) => state.fetchUserData)
  const refreshSelfWatchlist = usePlexStore((state) => state.refreshSelfWatchlist)
  const refreshOthersWatchlist = usePlexStore((state) => state.refreshOthersWatchlist)
  
  const testPlexToken = useCallback(async (token: string): Promise<boolean> => {
    setTestStatus('testing')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      const [response] = await Promise.all([
        fetch('/v1/plex/ping', {
          method: 'GET',
          headers: {
            'X-Plex-Token': token,
          },
        }),
        minimumLoadingTime,
      ])
      
      const result = await response.json()
      
      if (result.success) {
        setTestStatus('success')
        toast({
          description: 'Plex connection test successful',
          variant: 'default',
        })
        return true
      } else {
        setTestStatus('error')
        toast({
          description: result.message || 'Plex connection test failed',
          variant: 'destructive',
        })
        return false
      }
    } catch (error) {
      setTestStatus('error')
      toast({
        description: 'Error testing Plex connection',
        variant: 'destructive',
      })
      console.error('Plex connection test error:', error)
      return false
    }
  }, [toast])
  
  const savePlexToken = useCallback(async (token: string): Promise<boolean> => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([
        updateConfig({
          plexTokens: [token],
        }),
        minimumLoadingTime,
      ])
      
      setSaveStatus('success')
      toast({
        description: 'Plex token saved successfully',
        variant: 'default',
      })
      return true
    } catch (error) {
      setSaveStatus('error')
      toast({
        description: 'Error saving Plex token',
        variant: 'destructive',
      })
      console.error('Plex token save error:', error)
      return false
    }
  }, [toast, updateConfig])
  
  const removePlexToken = useCallback(async (): Promise<boolean> => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([
        updateConfig({
          plexTokens: [],
        }),
        minimumLoadingTime,
      ])
      
      setSaveStatus('idle')
      toast({
        description: 'Plex token removed successfully',
        variant: 'default',
      })
      return true
    } catch (error) {
      setSaveStatus('error')
      toast({
        description: 'Error removing Plex token',
        variant: 'destructive',
      })
      console.error('Plex token removal error:', error)
      return false
    }
  }, [toast, updateConfig])
  
  const setupPlex = useCallback(async (token: string): Promise<boolean> => {
    setTestStatus('loading')
    try {
      // First test connection
      const isValid = await testPlexToken(token)
      if (!isValid) return false
      
      // Then save token
      const isSaved = await savePlexToken(token)
      if (!isSaved) return false
      
      // Finally sync watchlists
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([
        refreshSelfWatchlist(),
        refreshOthersWatchlist(),
        fetchUserData(),
        minimumLoadingTime,
      ])
      
      return true
    } catch (error) {
      toast({
        description: 'Error setting up Plex connection',
        variant: 'destructive',
      })
      console.error('Plex setup error:', error)
      return false
    } finally {
      setTestStatus('idle')
    }
  }, [testPlexToken, savePlexToken, refreshSelfWatchlist, refreshOthersWatchlist, fetchUserData, toast])
  
  return {
    testStatus,
    saveStatus,
    setTestStatus,
    setSaveStatus,
    hasInitialized,
    testPlexToken,
    savePlexToken,
    removePlexToken,
    setupPlex,
  }
}