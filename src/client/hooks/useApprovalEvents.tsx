import { useEffect, useCallback, useRef } from 'react'
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

/**
 * Hook for subscribing to approval-related SSE events
 */
export function useApprovalEvents(options: UseApprovalEventsOptions = {}) {
  const { toast } = useToast()
  const { subscribeToType } = useProgressStore()
  
  // Use refs to store callback references to avoid dependency issues
  const optionsRef = useRef(options)
  optionsRef.current = options

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

    // Show toast notifications
    if (showToasts) {
      switch (metadata.action) {
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
  }, [toast])

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