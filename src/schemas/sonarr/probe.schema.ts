import {
  QualityProfileResourceSchema,
  RootFolderResourceSchema,
} from '@root/schemas/common/arr-resources.schema.js'
import { TagSchema } from '@root/schemas/sonarr/get-tags.schema.js'
import { z } from 'zod'

export const ProbeResponseSchema = z
  .object({
    success: z.literal(true),
    qualityProfiles: z.array(QualityProfileResourceSchema),
    rootFolders: z.array(RootFolderResourceSchema),
    tags: z.array(TagSchema),
  })
  .meta({
    id: 'SonarrProbeResponse',
    description:
      'Quality profiles, root folders and tags read from Sonarr with unsaved credentials',
  })

export type ProbeResponse = z.infer<typeof ProbeResponseSchema>
