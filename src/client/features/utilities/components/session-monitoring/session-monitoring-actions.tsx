import { Loader2, Power } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useMediaQuery } from '@/hooks/use-media-query'

import type {
  SessionMonitoringFormData,
  SessionMonitoringComponentProps,
} from '@/features/utilities/constants/session-monitoring'

interface SessionMonitoringActionsProps
  extends SessionMonitoringComponentProps {
  isSubmitting: boolean
  onSubmit: (data: SessionMonitoringFormData) => Promise<void>
}

/**
 * Renders an actions section for toggling session monitoring on or off within a form.
 *
 * Displays a button that enables or disables session monitoring and triggers an auto-save of the form state. The button's appearance and label adapt based on the current monitoring state and screen size.
 *
 * @param isEnabled - Indicates whether session monitoring is currently enabled.
 * @param isSubmitting - Indicates whether the form is currently being submitted.
 * @param onSubmit - Async handler called with the updated form values when toggling monitoring.
 *
 * @remark
 * The button label is hidden on mobile screens (viewport width ≤ 768px).
 */
export function SessionMonitoringActions({
  form,
  isEnabled,
  isSubmitting,
  onSubmit,
}: SessionMonitoringActionsProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div>
      <h3 className="font-medium text-text mb-2">Actions</h3>
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
          <span className={isMobile ? 'hidden' : 'ml-2'}>
            {isEnabled ? 'Disable' : 'Enable'}
          </span>
        </Button>
      </div>
    </div>
  )
}
