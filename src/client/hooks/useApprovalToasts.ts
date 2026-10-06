import type { ApprovalMetadata } from '@root/types/progress.types.js'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/components/ui/toast'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import {
  approvalToast,
  isApprovalMetadata,
  isToastedApprovalAction,
  type ToastedApprovalAction,
} from '@/lib/approval-toasts'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { useProgressStore } from '@/stores/progressStore'

const BATCH_WINDOW_MS = 500

/** Toasts approval events from the progress stream, batching a burst of one action into a single toast. */
export function useApprovalToasts(): void {
  const subscribeToType = useProgressStore((state) => state.subscribeToType)
  const navigate = useNavigate()
  const lookup = useUserDirectory()
  const lookupRef = useRef(lookup)

  useEffect(() => {
    lookupRef.current = lookup
  }, [lookup])

  useEffect(() => {
    const queues = new Map<ToastedApprovalAction, ApprovalMetadata[]>()
    const timers = new Map<
      ToastedApprovalAction,
      ReturnType<typeof setTimeout>
    >()

    const flush = (action: ToastedApprovalAction) => {
      const [first, ...rest] = queues.get(action) ?? []
      queues.delete(action)
      timers.delete(action)
      if (!first) return
      const { title, description } = approvalToast(action, [
        { ...first, userName: lookupRef.current(first.userName).name },
        ...rest,
      ])
      toast.add({
        title,
        description,
        actionProps:
          action === 'created'
            ? {
                children: 'View',
                onClick: () => navigate(pageHref(NAV_PAGES.approvalQueue)),
              }
            : undefined,
      })
    }

    const unsubscribe = subscribeToType('approval', (event) => {
      const metadata = event.metadata
      if (!isApprovalMetadata(metadata)) return
      if (!isToastedApprovalAction(metadata.action)) return
      const action = metadata.action
      queues.set(action, [...(queues.get(action) ?? []), metadata])
      clearTimeout(timers.get(action))
      timers.set(
        action,
        setTimeout(() => flush(action), BATCH_WINDOW_MS),
      )
    })

    return () => {
      unsubscribe()
      for (const timer of timers.values()) clearTimeout(timer)
    }
  }, [subscribeToType, navigate])
}
