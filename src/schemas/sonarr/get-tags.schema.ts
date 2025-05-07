import { z } from 'zod'
import { InstanceInfoSchema } from './get-quality-profiles.schema.js'

export const TagsResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  tags: z.array(
    z.object({
      id: z.number(),
      label: z.string(),
    }),
  ),
})

export type TagsResponse = z.infer<typeof TagsResponseSchema>
