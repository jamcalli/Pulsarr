import { z } from 'zod'

export const ArrInstanceQuerySchema = z.object({
  instanceId: z.coerce.number().int().positive(),
})

export const ArrInstanceInfoSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    baseUrl: z.string(),
  })
  .meta({
    id: 'ArrInstanceInfo',
    description: 'The Radarr or Sonarr instance a lookup ran against',
  })
