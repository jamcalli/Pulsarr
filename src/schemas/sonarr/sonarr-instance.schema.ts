import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { ArrBaseUrlSchema } from '@root/schemas/common/url.schema.js'
import { SonarrSeasonMonitoringValueSchema } from '@root/schemas/sonarr/season-monitoring.schema.js'
import { SonarrSeriesTypeSchema } from '@root/schemas/sonarr/series-type.schema.js'
import { z } from 'zod'

export const SonarrMonitorNewItemsSchema = z.enum(['all', 'none']).meta({
  id: 'SonarrMonitorNewItems',
  description: 'Whether Sonarr monitors seasons added to a series later',
})

export const SonarrInstanceFieldsSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: ArrBaseUrlSchema,
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean(),
  seasonMonitoring: SonarrSeasonMonitoringValueSchema,
  monitorNewItems: SonarrMonitorNewItemsSchema,
  searchOnAdd: z.boolean(),
  createSeasonFolders: z.boolean(),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()),
  seriesType: SonarrSeriesTypeSchema,
  skipDefaultRoutingWhenNoMatch: z.boolean(),
})

const sonarrFields = SonarrInstanceFieldsSchema.shape

export const SonarrInstanceSchema = SonarrInstanceFieldsSchema.extend({
  bypassIgnored: sonarrFields.bypassIgnored.default(false),
  seasonMonitoring: sonarrFields.seasonMonitoring.default('all'),
  monitorNewItems: sonarrFields.monitorNewItems.default('all'),
  searchOnAdd: sonarrFields.searchOnAdd.default(true),
  createSeasonFolders: sonarrFields.createSeasonFolders.default(false),
  tags: sonarrFields.tags.default([]),
  isDefault: sonarrFields.isDefault.default(false),
  syncedInstances: sonarrFields.syncedInstances.optional(),
  seriesType: sonarrFields.seriesType.default('standard'),
  skipDefaultRoutingWhenNoMatch:
    sonarrFields.skipDefaultRoutingWhenNoMatch.default(false),
}).meta({
  id: 'SonarrInstancePayload',
  description: 'A new Sonarr instance, omitted settings take their defaults',
})

export const SonarrInstanceUpdateSchema =
  SonarrInstanceFieldsSchema.partial().meta({
    id: 'SonarrInstanceUpdatePayload',
    description:
      'Partial Sonarr instance update, omitted fields keep their stored value',
  })

export const SonarrInstanceResponseSchema = SonarrInstanceSchema.extend({
  id: z.number(),
  baseUrl: z.string(),
}).meta({
  id: 'SonarrInstance',
  description: 'A configured Sonarr instance',
})

export const SonarrInstanceListResponseSchema = z
  .array(SonarrInstanceResponseSchema)
  .meta({
    id: 'SonarrInstanceListResponse',
    description: 'All configured Sonarr instances',
  })

export const SonarrInstanceCreateResponseSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .meta({
    id: 'SonarrInstanceCreateResponse',
    description: 'Id of the newly created Sonarr instance',
  })

// Inferred types for use in client and server
export type SonarrInstance = z.infer<typeof SonarrInstanceSchema>
export type SonarrInstanceUpdate = z.infer<typeof SonarrInstanceUpdateSchema>
export type SonarrInstanceResponse = z.infer<
  typeof SonarrInstanceResponseSchema
>
export type SonarrInstanceListResponse = z.infer<
  typeof SonarrInstanceListResponseSchema
>
export type SonarrInstanceCreateResponse = z.infer<
  typeof SonarrInstanceCreateResponseSchema
>

export { ErrorSchema }
