import { useEffect, useCallback, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent, ApprovalMetadata } from '@root/types/progress.types'

interface UseApprovalEventsOptions {
  onApprovalCreated?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalUpdated?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalApproved?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalRejected?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalDeleted?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  showToasts?: boolean
}

interface QueuedToast {
  action: 'created' | 'approved' | 'rejected' | 'deleted'
  metadata: ApprovalMetadata
  timestamp: number
}

/**
 * Hook for subscribing to approval-related SSE events with toast queueing
 */
export function useApprovalEvents(options: UseApprovalEventsOptions = {}) {
  const { toast } = useToast()
  const { subscribeToType } = useProgressStore()
  
  // Toast queueing state
  const [, setToastQueue] = useState<Map<string, QueuedToast[]>>(new Map())
  const queueTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Use refs to store callback references to avoid dependency issues
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Process queued toasts for a specific action type
  const processQueuedToasts = useCallback((action: string) => {
    setToastQueue(prev => {
      const actionQueue = prev.get(action)
      if (!actionQueue || actionQueue.length === 0) return prev
      
      // Show single toast for individual actions, batched toast for multiple
      if (actionQueue.length === 1) {
        const { metadata } = actionQueue[0]
        switch (action) {
          case 'created':
            toast({
              title: '📝 New Approval Request',
              description: `${metadata.userName} requested ${metadata.contentTitle} (${metadata.contentType})`,
              variant: 'default',
            })
            break
          case 'approved':
            toast({
              title: '✅ Request Approved',
              description: `${metadata.contentTitle} has been approved for ${metadata.userName}`,
              variant: 'default',
            })
            break
          case 'rejected':
            toast({
              title: '❌ Request Rejected',
              description: `${metadata.userName}'s request for ${metadata.contentTitle} was rejected`,
              variant: 'destructive',
            })
            break
          case 'deleted':
            toast({
              title: '🗑️ Request Deleted',
              description: `Request for ${metadata.contentTitle} by ${metadata.userName} was deleted`,
              variant: 'default',
            })
            break
        }
      } else {
        // Show batched toast for multiple actions
        const count = actionQueue.length
        switch (action) {
          case 'created':
            toast({
              title: '📝 New Approval Requests',
              description: `${count} new approval requests have been received`,
              variant: 'default',
            })
            break
          case 'approved':
            toast({
              title: '✅ Requests Approved',
              description: `${count} approval requests have been approved`,
              variant: 'default',
            })
            break
          case 'rejected':
            toast({
              title: '❌ Requests Rejected',
              description: `${count} approval requests have been rejected`,
              variant: 'destructive',
            })
            break
          case 'deleted':
            toast({
              title: '🗑️ Requests Deleted',
              description: `${count} approval requests have been deleted`,
              variant: 'default',
            })
            break
        }
      }
      
      // Clear the processed queue
      const newQueue = new Map(prev)
      newQueue.delete(action)
      return newQueue
    })
    
    // Clear the timer for this action
    const timer = queueTimerRef.current.get(action)
    if (timer) {
      clearTimeout(timer)
      queueTimerRef.current.delete(action)
    }
  }, [toast])

  // Add toast to queue and set/reset timer
  const queueToast = useCallback((action: string, metadata: ApprovalMetadata) => {
    const queuedToast: QueuedToast = {
      action: action as 'created' | 'approved' | 'rejected' | 'deleted',
      metadata,
      timestamp: Date.now()
    }
    
    setToastQueue(prev => {
      const newQueue = new Map(prev)
      const actionQueue = newQueue.get(action) || []
      actionQueue.push(queuedToast)
      newQueue.set(action, actionQueue)
      return newQueue
    })
    
    // Clear existing timer and set new one
    const existingTimer = queueTimerRef.current.get(action)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    // Process queue after 500ms of no new events of this type
    const timer = setTimeout(() => processQueuedToasts(action), 500)
    queueTimerRef.current.set(action, timer)
  }, [processQueuedToasts])

  const handleApprovalEvent = useCallback((event: ProgressEvent) => {
    if (event.type !== 'approval') return
    
    const metadata = event.metadata as ApprovalMetadata
    if (!metadata) return

    const {
      onApprovalCreated,
      onApprovalUpdated,
      onApprovalApproved,
      onApprovalRejected,
      onApprovalDeleted,
      showToasts = true,
    } = optionsRef.current

    // Queue toast notifications instead of showing immediately
    if (showToasts && ['created', 'approved', 'rejected', 'deleted'].includes(metadata.action)) {
      queueToast(metadata.action, metadata)
    }

    // Call specific handlers
    switch (metadata.action) {
      case 'created':
        onApprovalCreated?.(event, metadata)
        break
      case 'updated':
        onApprovalUpdated?.(event, metadata)
        break
      case 'approved':
        onApprovalApproved?.(event, metadata)
        break
      case 'rejected':
        onApprovalRejected?.(event, metadata)
        break
      case 'deleted':
        onApprovalDeleted?.(event, metadata)
        break
    }
  }, [queueToast])
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      queueTimerRef.current.forEach(timer => clearTimeout(timer))
      queueTimerRef.current.clear()
    }
  }, [])

  useEffect(() => {
    // Subscribe to approval events
    const unsubscribe = subscribeToType('approval', handleApprovalEvent)
    return unsubscribe
  }, [subscribeToType, handleApprovalEvent])
}

/**
 * Simplified hook that only shows toast notifications for approval events
 * This should be used at a high level (like authenticated app) to show toasts everywhere
 */
export function useApprovalToasts() {
  useApprovalEvents({ showToasts: true })
}

/**
 * Hook for approval page data management - handles SSE events to update local state
 * This should only be used on the approval management page
 */
export function useApprovalPageEvents(options: {
  onApprovalCreated?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalUpdated?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalApproved?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalRejected?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
  onApprovalDeleted?: (event: ProgressEvent, metadata: ApprovalMetadata) => void
}) {
  useApprovalEvents({
    ...options,
    showToasts: false, // Don't show toasts here - they're handled at a higher level
  })
}