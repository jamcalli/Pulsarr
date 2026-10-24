import { ArrInstanceInfoSchema } from '@root/schemas/common/arr-instance-query.schema.js'
import {
  QualityProfileResourceSchema,
  RootFolderResourceSchema,
} from '@root/schemas/common/arr-resources.schema.js'
import { ArrTagSchema } from '@root/schemas/common/arr-tag.schema.js'
import { z } from 'zod'

export const ArrQualityProfilesResponseSchema = z
  .object({
    success: z.boolean(),
    instance: ArrInstanceInfoSchema,
    qualityProfiles: z.array(QualityProfileResourceSchema),
  })
  .meta({
    id: 'ArrQualityProfilesResponse',
    description: 'Quality profiles read from a saved Radarr or Sonarr instance',
  })

export const ArrRootFoldersResponseSchema = z
  .object({
    success: z.boolean(),
    instance: ArrInstanceInfoSchema,
    rootFolders: z.array(RootFolderResourceSchema),
  })
  .meta({
    id: 'ArrRootFoldersResponse',
    description: 'Root folders read from a saved Radarr or Sonarr instance',
  })

export const ArrTagsResponseSchema = z
  .object({
    success: z.boolean(),
    instance: ArrInstanceInfoSchema,
    tags: z.array(ArrTagSchema),
  })
  .meta({
    id: 'ArrTagsResponse',
    description: 'Tags read from a saved Radarr or Sonarr instance',
  })
