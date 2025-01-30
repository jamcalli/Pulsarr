import { z } from 'zod'
import type { RootFolder } from '@root/types/sonarr.types.js'

export const RootFoldersResponseSchema = z.object({
  success: z.boolean(),
  rootFolders: z.array(z.custom<RootFolder>()),
})

export const RootFoldersErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
})
