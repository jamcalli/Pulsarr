import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { ArrBaseUrlSchema } from '@root/schemas/common/url.schema.js'
import {
  RadarrMinimumAvailabilitySchema,
  RadarrMonitorSchema,
} from '@root/schemas/radarr/add-options.schema.js'
import { z } from 'zod'

export const RadarrInstanceFieldsSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: ArrBaseUrlSchema,
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean(),
  searchOnAdd: z.boolean(),
  minimumAvailability: RadarrMinimumAvailabilitySchema,
  monitor: RadarrMonitorSchema,
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()),
  skipDefaultRoutingWhenNoMatch: z.boolean(),
})

const radarrFields = RadarrInstanceFieldsSchema.shape

export const RadarrInstanceSchema = RadarrInstanceFieldsSchema.extend({
  bypassIgnored: radarrFields.bypassIgnored.default(false),
  searchOnAdd: radarrFields.searchOnAdd.default(true),
  minimumAvailability: radarrFields.minimumAvailability.default('released'),
  monitor: radarrFields.monitor.default('movieOnly'),
  tags: radarrFields.tags.default([]),
  isDefault: radarrFields.isDefault.default(false),
  syncedInstances: radarrFields.syncedInstances.optional(),
  skipDefaultRoutingWhenNoMatch:
    radarrFields.skipDefaultRoutingWhenNoMatch.default(false),
}).meta({
  id: 'RadarrInstancePayload',
  description: 'A new Radarr instance, omitted settings take their defaults',
})

export const RadarrInstanceUpdateSchema =
  RadarrInstanceFieldsSchema.partial().meta({
    id: 'RadarrInstanceUpdatePayload',
    description:
      'Partial Radarr instance update, omitted fields keep their stored value',
  })

export const RadarrInstanceResponseSchema = RadarrInstanceSchema.extend({
  id: z.number(),
  baseUrl: z.string(),
}).meta({
  id: 'RadarrInstance',
  description: 'A configured Radarr instance',
})

export const RadarrInstanceListResponseSchema = z
  .array(RadarrInstanceResponseSchema)
  .meta({
    id: 'RadarrInstanceListResponse',
    description: 'All configured Radarr instances',
  })

export const RadarrInstanceCreateResponseSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .meta({
    id: 'RadarrInstanceCreateResponse',
    description: 'Id of the newly created Radarr instance',
  })

export type RadarrInstance = z.infer<typeof RadarrInstanceSchema>
export type RadarrInstanceUpdate = z.infer<typeof RadarrInstanceUpdateSchema>
export type RadarrInstanceResponse = z.infer<
  typeof RadarrInstanceResponseSchema
>
export type RadarrInstanceListResponse = z.infer<
  typeof RadarrInstanceListResponseSchema
>
export type RadarrInstanceCreateResponse = z.infer<
  typeof RadarrInstanceCreateResponseSchema
>

export { ErrorSchema }
