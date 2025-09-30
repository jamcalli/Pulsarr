import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useSyncProgress } from '@/features/sonarr/hooks/instance/useSyncProgress'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'

interface SonarrSyncModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  syncedInstances: number[]
  instanceId: number
  isManualSync?: boolean
}

/**
 * Displays a modal dialog for synchronizing one or more Sonarr instances, managing the synchronization process and progress.
 *
 * The modal guides the user through the synchronization of selected Sonarr instances, showing progress for each instance and overall progress when multiple instances are involved. It prevents interruption during active synchronization and provides feedback on completion or errors. The modal can be triggered for manual or automatic sync scenarios.
 *
 * @param open - Whether the modal is visible
 * @param onOpenChange - Callback to handle modal open state changes
 * @param syncedInstances - Array of Sonarr instance IDs to synchronize
 * @param isManualSync - If true, synchronization starts automatically when the modal opens; otherwise, user interaction is required
 * @returns The rendered modal dialog component
 */
export function SonarrSyncModal({
  open,
  onOpenChange,
  syncedInstances,
  isManualSync = false,
}: SonarrSyncModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentInstanceIndex, setCurrentInstanceIndex] = useState(-1)
  const [syncCompleted, setSyncCompleted] = useState(false)
  const [overallProgress, setOverallProgress] = useState(0)

  const allInstances = useSonarrStore((state) => state.instances)
  const instanceNamesRef = useRef<Record<number, string>>({})
  const isSingleInstance = syncedInstances.length === 1

  useEffect(() => {
    const nameMap: Record<number, string> = {}
    for (const instance of allInstances) {
      nameMap[instance.id] = instance.name
    }
    instanceNamesRef.current = nameMap
  }, [allInstances])

  const syncProgress = useSyncProgress()

  useEffect(() => {
    if (
      open &&
      isManualSync &&
      !isSubmitting &&
      currentInstanceIndex === -1 &&
      !syncCompleted
    ) {
      setIsSubmitting(true)
      if (syncedInstances.length > 0) {
        setCurrentInstanceIndex(0)
      } else {
        setSyncCompleted(true)
        toast('No instances to synchronize')
      }
    }
  }, [
    open,
    isManualSync,
    isSubmitting,
    currentInstanceIndex,
    syncCompleted,
    syncedInstances.length,
  ])

  useEffect(() => {
    if (open && !isManualSync) {
      setIsSubmitting(false)
      setCurrentInstanceIndex(-1)
      setSyncCompleted(false)
      setOverallProgress(0)
    }
  }, [open, isManualSync])

  useEffect(() => {
    if (syncCompleted) {
      const timer = setTimeout(() => {
        onOpenChange(false)
        setIsSubmitting(false)
        setCurrentInstanceIndex(-1)
        setSyncCompleted(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [syncCompleted, onOpenChange])

  useEffect(() => {
    if (
      syncProgress.isComplete &&
      currentInstanceIndex >= 0 &&
      currentInstanceIndex < syncedInstances.length &&
      syncProgress.operationId.includes(
        `sonarr-instance-sync-${syncedInstances[currentInstanceIndex]}`,
      )
    ) {
      const nextIndex = currentInstanceIndex + 1

      if (nextIndex < syncedInstances.length) {
        setCurrentInstanceIndex(nextIndex)
        setOverallProgress(
          Math.floor((nextIndex / syncedInstances.length) * 100),
        )
      } else {
        setOverallProgress(100)
        setSyncCompleted(true)

        toast.success('Successfully synchronized all Sonarr instances')
      }
    }
  }, [syncProgress, currentInstanceIndex, syncedInstances])

  useEffect(() => {
    const syncCurrentInstance = async () => {
      if (
        currentInstanceIndex >= 0 &&
        currentInstanceIndex < syncedInstances.length
      ) {
        try {
          const instanceToSync = syncedInstances[currentInstanceIndex]

          const response = await fetch(
            api(`/v1/sync/instance/${instanceToSync}?type=sonarr`),
            {
              method: 'POST',
            },
          )

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.message || 'Failed to sync instance')
          }
        } catch (error) {
          console.error('Error syncing instance:', error)
          toast.error(
            error instanceof Error
              ? error.message
              : 'An error occurred during synchronization',
          )

          const nextIndex = currentInstanceIndex + 1
          if (nextIndex < syncedInstances.length) {
            setCurrentInstanceIndex(nextIndex)
          } else {
            setSyncCompleted(true)
          }
        }
      }
    }

    if (isSubmitting && currentInstanceIndex >= 0) {
      syncCurrentInstance()
    }
  }, [currentInstanceIndex, syncedInstances, isSubmitting])

  const handleSync = () => {
    setIsSubmitting(true)

    if (syncedInstances.length > 0) {
      setCurrentInstanceIndex(0)
    } else {
      setSyncCompleted(true)
      toast('No instances to synchronize')
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen)
    }
  }

  const getCurrentInstanceName = () => {
    if (
      currentInstanceIndex >= 0 &&
      currentInstanceIndex < syncedInstances.length
    ) {
      const instanceId = syncedInstances[currentInstanceIndex]
      return instanceNamesRef.current[instanceId] || `Instance ${instanceId}`
    }
    return ''
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => {
          if (isSubmitting) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {!isSubmitting
              ? 'Instance Synchronization'
              : syncCompleted
                ? 'Synchronization Complete'
                : 'Synchronizing Instances'}
          </DialogTitle>
          <DialogDescription>
            {!isSubmitting
              ? 'Would you like to synchronize content to your synced instances?'
              : syncCompleted
                ? 'All instances have been synchronized successfully.'
                : isSingleInstance
                  ? `Synchronizing content to ${getCurrentInstanceName()}...`
                  : `Synchronizing content between instances... (${currentInstanceIndex + 1}/${syncedInstances.length})`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isSubmitting ? (
            <div className="space-y-4">
              {/* Only show overall progress if more than one instance is being synced */}
              {!isSingleInstance && !syncCompleted && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground">
                      Overall Progress
                    </span>
                    <span className="text-sm text-foreground">
                      {overallProgress}%
                    </span>
                  </div>
                  <Progress value={overallProgress} />
                </div>
              )}

              {/* Current instance progress */}
              {!syncCompleted && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground">
                      {syncProgress.message
                        ? syncProgress.message.replace(
                            /instance \d+/i,
                            getCurrentInstanceName(),
                          )
                        : `Syncing ${getCurrentInstanceName()}`}
                    </span>
                    <span className="text-sm text-foreground">
                      {syncProgress.progress}%
                    </span>
                  </div>
                  <Progress value={syncProgress.progress} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Your configuration includes {syncedInstances.length} synced{' '}
                {syncedInstances.length === 1 ? 'instance' : 'instances'}. Would
                you like to perform an initial synchronization now?
              </p>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="neutralnoShadow"
                  onClick={handleSkip}
                  disabled={isSubmitting}
                >
                  Skip
                </Button>
                <Button
                  variant="noShadow"
                  onClick={handleSync}
                  disabled={isSubmitting || syncedInstances.length === 0}
                >
                  Sync Now
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SonarrSyncModal
