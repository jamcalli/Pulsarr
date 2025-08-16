import type { Config } from '@root/schemas/config/config.schema'
import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

// Extract the session monitoring configuration schema from the backend config
export const SessionMonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  pollingIntervalMinutes: z.number().min(1).max(1440),
  remainingEpisodes: z.number().min(1).max(10),
  filterUsers: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      // Always convert to array for consistency
      if (!val) return undefined
      return Array.isArray(val) ? val : [val]
    }),
  enableAutoReset: z.boolean().optional(),
  inactivityResetDays: z.number().min(1).max(365).optional(),
  autoResetIntervalHours: z.number().min(1).max(168).optional(),
  enableProgressiveCleanup: z.boolean().optional(),
})

// Form type - use z.input for better compatibility with form inputs
export type SessionMonitoringFormData = z.input<
  typeof SessionMonitoringConfigSchema
>

// Re-export the backend config type for compatibility
export type PlexSessionMonitoringConfig = NonNullable<
  Config['plexSessionMonitoring']
>

// Common props interface for session monitoring components
export interface SessionMonitoringComponentProps {
  form: UseFormReturn<SessionMonitoringFormData>
  isEnabled: boolean
}
