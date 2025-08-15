import { Loader2, Power } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface SessionMonitoringActionsProps {
  isEnabled: boolean
  isSubmitting: boolean
  isToggling: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

/**
 * Renders an action section with a button to enable or disable session monitoring in a form.
 *
 * The button immediately toggles the monitoring state via API call with proper loading states and user feedback. The button's appearance and label reflect the current monitoring state and submission status.
 *
 * @param isEnabled - Whether session monitoring is currently enabled.
 * @param isSubmitting - Whether the form is currently being submitted.
 * @param isToggling - Whether the toggle operation is in progress.
 * @param onToggle - Async function to toggle the monitoring state.
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
