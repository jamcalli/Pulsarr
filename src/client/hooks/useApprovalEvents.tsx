import { useEffect, useCallback, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useProgressStore } from '@/stores/progressStore'
import { FileText, CheckCircle, XCircle, Trash2 } from 'lucide-react'
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
 * Subscribes to approval-related server-sent events (SSE) and manages toast notifications with batching and optional event callbacks.
 *
 * This hook listens for approval events such as creation, update, approval, rejection, and deletion. It can queue and batch toast notifications to avoid spamming users, and invokes optional callbacks for each approval action. Toast notifications can be enabled or disabled via the `showToasts` option.
 *
 * @param options - Optional callbacks for each approval action and a flag to enable or disable toast notifications.
 */
export function useApprovalEvents(options: UseApprovalEventsOptions = {}) {
  const { toast } = useToast()
  const { subscribeToType } = useProgressStore()
  
  // Toast queueing refs
  const toastQueueRef = useRef<Map<string, QueuedToast[]>>(new Map())
  const queueTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Use refs to store callback references to avoid dependency issues
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Process queued toasts for a specific action type
  const processQueuedToasts = useCallback((action: string) => {
    const actionQueue = toastQueueRef.current.get(action)
    if (!actionQueue || actionQueue.length === 0) return
    
    // Show single toast for individual actions, batched toast for multiple
    if (actionQueue.length === 1) {
        const { metadata } = actionQueue[0]
        switch (action) {
          case 'created':
            toast({
              title: 'New Approval Request',
              description: (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span>{metadata.userName} requested {metadata.contentTitle} ({metadata.contentType})</span>
                </div>
              ),
              variant: 'default',
            })
            break
          case 'approved':
            toast({
              title: 'Request Approved',
              description: (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{metadata.contentTitle} has been approved for {metadata.userName}</span>
                </div>
              ),
              variant: 'default',
            })
            break
          case 'rejected':
            toast({
              title: 'Request Rejected',
              description: (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{metadata.userName}'s request for {metadata.contentTitle} was rejected</span>
                </div>
              ),
              variant: 'destructive',
            })
            break
          case 'deleted':
            toast({
              title: 'Request Deleted',
              description: (
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 flex-shrink-0" />
                  <span>Request for {metadata.contentTitle} by {metadata.userName} was deleted</span>
                </div>
              ),
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
              title: 'New Approval Requests',
              description: (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span>{count} new approval requests have been received</span>
                </div>
              ),
              variant: 'default',
            })
            break
          case 'approved':
            toast({
              title: 'Requests Approved',
              description: (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{count} approval requests have been approved</span>
                </div>
              ),
              variant: 'default',
            })
            break
          case 'rejected':
            toast({
              title: 'Requests Rejected',
              description: (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{count} approval requests have been rejected</span>
                </div>
              ),
              variant: 'destructive',
            })
            break
          case 'deleted':
            toast({
              title: 'Requests Deleted',
              description: (
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 flex-shrink-0" />
                  <span>{count} approval requests have been deleted</span>
                </div>
              ),
              variant: 'default',
            })
            break
        }
      }
      
      // Clear the processed queue
      toastQueueRef.current.delete(action)
    
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
    
    const actionQueue = toastQueueRef.current.get(action) || []
    actionQueue.push(queuedToast)
    toastQueueRef.current.set(action, actionQueue)
    
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
 * Subscribes to approval events and displays toast notifications globally.
 *
 * Intended for use at the top level of the application to provide approval-related toasts across all pages.
 */
export function useApprovalToasts() {
  useApprovalEvents({ showToasts: true })
}

/**
 * Subscribes to approval-related SSE events and invokes provided callbacks for each action, without displaying toast notifications.
 *
 * Intended for use on the approval management page to update local state in response to approval events.
 *
 * @param options - Optional callbacks for handling approval creation, update, approval, rejection, and deletion events.
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