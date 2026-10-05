import { z } from 'zod'

export const InstanceTypeSchema = z.enum(['radarr', 'sonarr']).meta({
  id: 'InstanceType',
  description: 'Arr instance kind, radarr or sonarr',
})

export type InstanceType = z.infer<typeof InstanceTypeSchema>
