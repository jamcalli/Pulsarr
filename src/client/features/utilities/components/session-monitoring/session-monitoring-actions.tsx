import { Loader2, Power } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface SessionMonitoringActionsProps {
  isEnabled: boolean
  isSubmitting: boolean
  isToggling: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

/**
 * Render the "Actions" control with a toggle button to enable or disable session monitoring.
 *
 * The button calls `onToggle` with the opposite of `isEnabled`. It is disabled while `isSubmitting`
 * or `isToggling` is true. While `isToggling` the button shows a spinner and the label changes
 * to "Enabling..." / "Disabling..."; otherwise it shows "Enable" / "Disable" and a power icon.
 *
 * @param onToggle - Async callback invoked with the new enabled state (boolean).
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
