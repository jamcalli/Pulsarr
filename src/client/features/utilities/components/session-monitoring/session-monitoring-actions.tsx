import { Loader2, Power } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type {
  SessionMonitoringComponentProps,
  SessionMonitoringFormData,
} from '@/features/utilities/constants/session-monitoring'

interface SessionMonitoringActionsProps
  extends SessionMonitoringComponentProps {
  isSubmitting: boolean
  onSubmit: (data: SessionMonitoringFormData) => Promise<void>
}

/**
 * Renders an action section with a button to enable or disable session monitoring in a form.
 *
 * The button toggles the monitoring state, marks the form as dirty, and triggers an auto-save by calling the provided submission handler with the updated form values. The button's appearance and label reflect the current monitoring state and submission status.
 *
 * @param isEnabled - Whether session monitoring is currently enabled.
 * @param isSubmitting - Whether the form is currently being submitted.
 * @param onSubmit - Async function invoked with updated form values when toggling monitoring.
 */
export function SessionMonitoringActions({
  form,
  isEnabled,
  isSubmitting,
  onSubmit,
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
            form.setValue('enabled', newEnabledState, {
              shouldDirty: true,
            })
            // Auto-save when toggling enable/disable
            await onSubmit(form.getValues())
          }}
          disabled={isSubmitting}
          variant={isEnabled ? 'error' : 'noShadow'}
          className="h-8"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          <span className="ml-2">{isEnabled ? 'Disable' : 'Enable'}</span>
        </Button>
      </div>
    </div>
  )
}
