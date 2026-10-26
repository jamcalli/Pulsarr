import { z } from 'zod'

export const ArrTagSchema = z
  .object({
    id: z.number(),
    label: z.string(),
  })
  .meta({ id: 'ArrTag', description: 'A Radarr or Sonarr tag' })
