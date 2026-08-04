import { z } from 'zod'

// Sonarr and Radarr return these resources verbatim from their own APIs.
// Only the fields the app depends on are declared; loose objects keep the
// rest of the upstream payload intact on the wire across arr versions.
export const RootFolderResourceSchema = z.looseObject({
  id: z.number(),
  path: z.string(),
})

export const QualityProfileResourceSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
})

export type RootFolderResource = z.infer<typeof RootFolderResourceSchema>
export type QualityProfileResource = z.infer<
  typeof QualityProfileResourceSchema
>
