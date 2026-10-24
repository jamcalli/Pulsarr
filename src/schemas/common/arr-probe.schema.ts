import {
  QualityProfileResourceSchema,
  RootFolderResourceSchema,
} from '@root/schemas/common/arr-resources.schema.js'
import { ArrTagSchema } from '@root/schemas/common/arr-tag.schema.js'
import { z } from 'zod'

export const ArrProbeResponseSchema = z
  .object({
    success: z.literal(true),
    qualityProfiles: z.array(QualityProfileResourceSchema),
    rootFolders: z.array(RootFolderResourceSchema),
    tags: z.array(ArrTagSchema),
  })
  .meta({
    id: 'ArrProbeResponse',
    description:
      'Quality profiles, root folders and tags read from a Radarr or Sonarr server with unsaved credentials',
  })
