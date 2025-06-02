import { Button } from '@/components/ui/button'
import { Loader2, Power } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { UseFormReturn } from 'react-hook-form'

type SessionMonitoringFormData = {
  enabled: boolean
  pollingIntervalMinutes: number
  remainingEpisodes: number
  filterUsers?: string[]
  enableAutoReset: boolean
  inactivityResetDays: number
  autoResetIntervalHours: number
}

interface SessionMonitoringActionsProps {
  form: UseFormReturn<SessionMonitoringFormData>
  isEnabled: boolean
  isSubmitting: boolean
  onSubmit: (data: SessionMonitoringFormData) => Promise<void>
}

/**
 * Actions section for session monitoring form containing enable/disable toggle
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
