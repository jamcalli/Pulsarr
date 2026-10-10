import { z } from 'zod'
import { InstanceInfoSchema } from './get-quality-profiles.schema.js'

export const TagSchema = z.object({
  id: z.number(),
  label: z.string(),
})

export const TagsResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  tags: z.array(TagSchema),
})

export type TagsResponse = z.infer<typeof TagsResponseSchema>
