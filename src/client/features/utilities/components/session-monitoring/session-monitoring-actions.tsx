import { Loader2, Power } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface SessionMonitoringActionsProps {
  isEnabled: boolean
  isSubmitting: boolean
  isToggling: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

/**
 * Render the "Actions" section containing a single button to enable or disable session monitoring.
 *
 * The button calls `onToggle` with the new desired enabled state and reflects in its
 * appearance and label the current state and progress: it shows a spinner while `isToggling`,
 * is disabled while `isSubmitting || isToggling`, and uses an "error" variant when enabled.
 *
 * @param onToggle - Async callback invoked with the new enabled state when the button is clicked.
 * @returns The Actions UI for toggling session monitoring.
 */
export function SessionMonitoringActions({
  isEnabled,
  isSubmitting,
  isToggling,
  onToggle,
}: SessionMonitoringActionsProps) {
  return (
    <div>
      <h3 className="font-medium text-foreground mb-2">Actions</h3>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            const newEnabledState = !isEnabled
            try {
              await onToggle(newEnabledState)
            } catch (error) {
              // Error handling is done in the hook
              console.error('Toggle failed:', error)
            }
          }}
          disabled={isSubmitting || isToggling}
          variant={isEnabled ? 'error' : 'noShadow'}
          className="h-8"
        >
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          <span className="ml-2">
            {isToggling
              ? isEnabled
                ? 'Disabling...'
                : 'Enabling...'
              : isEnabled
                ? 'Disable'
                : 'Enable'}
          </span>
        </Button>
      </div>
    </div>
  )
}
