import { TagLabelSchema } from '@root/schemas/shared/tag-validation.schema.js'
import { z } from 'zod'

export const ArrCreateTagBodySchema = z
  .object({
    instanceId: z.coerce
      .number()
      .int({ error: 'Instance ID must be an integer' })
      .positive({ error: 'Instance ID must be positive' }),
    label: TagLabelSchema,
  })
  .strict()
  .meta({
    id: 'ArrCreateTagBody',
    description: 'Tag to create on a saved Radarr or Sonarr instance',
  })

export const ArrCreateTagResponseSchema = z
  .object({
    id: z.number().int().positive(),
    label: z.string().trim(),
  })
  .meta({
    id: 'ArrCreateTagResponse',
    description: 'The tag as Radarr or Sonarr stored it',
  })
