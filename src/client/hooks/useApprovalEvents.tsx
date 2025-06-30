import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
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
 * Subscribes to approval server-sent events and manages batched toast notifications and optional event callbacks.
 *
 * Listens for approval events such as creation, update, approval, rejection, and deletion. Optionally displays toast notifications for these events, batching multiple notifications of the same type within a short interval to reduce notification spam. Invokes provided callbacks for each approval action if specified.
 *
 * @param options - Optional callbacks for approval actions and a flag to enable or disable toast notifications.
 */
export function useApprovalEvents(options: UseApprovalEventsOptions = {}) {
  const { subscribeToType } = useProgressStore()
  const navigate = useNavigate()
  
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
            toast(
              <div>
                <div className="font-semibold">New Approval Request</div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>{metadata.userName} requested {metadata.contentTitle} ({metadata.contentType})</span>
                </div>
              </div>,
              {
                action: {
                  label: 'View',
                  onClick: () => navigate('/approvals')
                }
              }
            )
            break
          case 'approved':
            toast(
              <div>
                <div className="font-semibold">Request Approved</div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{metadata.contentTitle} has been approved for {metadata.userName}</span>
                </div>
              </div>
            )
            break
          case 'rejected':
            toast(
              <div>
                <div className="font-semibold">Request Rejected</div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{metadata.userName}'s request for {metadata.contentTitle} was rejected</span>
                </div>
              </div>
            )
            break
          case 'deleted':
            toast(
              <div>
                <div className="font-semibold">Request Deleted</div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>Request for {metadata.contentTitle} by {metadata.userName} was deleted</span>
                </div>
              </div>
            )
            break
        }
      } else {
        // Show batched toast for multiple actions
        const count = actionQueue.length
        switch (action) {
          case 'created':
            toast(
              <div>
                <div className="font-semibold">New Approval Requests</div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>{count} new approval requests have been received</span>
                </div>
              </div>,
              {
                action: {
                  label: 'View',
                  onClick: () => navigate('/approvals')
                }
              }
            )
            break
          case 'approved':
            toast(
              <div>
                <div className="font-semibold">Requests Approved</div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{count} approval requests have been approved</span>
                </div>
              </div>
            )
            break
          case 'rejected':
            toast(
              <div>
                <div className="font-semibold">Requests Rejected</div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{count} approval requests have been rejected</span>
                </div>
              </div>
            )
            break
          case 'deleted':
            toast(
              <div>
                <div className="font-semibold">Requests Deleted</div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>{count} approval requests have been deleted</span>
                </div>
              </div>
            )
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
  }, [])

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
 * Enables global toast notifications for approval events throughout the application.
 *
 * Intended to be used at the application's top level to display approval-related toasts on all pages.
 */
export function useApprovalToasts() {
  useApprovalEvents({ showToasts: true })
}

/**
 * Subscribes to approval-related server-sent events and triggers optional callbacks for each approval action, without showing toast notifications.
 *
 * Use this hook on approval management pages to update local state in response to approval events.
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