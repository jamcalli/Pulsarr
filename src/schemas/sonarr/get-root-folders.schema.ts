import { z } from 'zod'
import type { RootFolder } from '@root/types/sonarr.types.js'

export const InstanceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  baseUrl: z.string(),
})

export const RootFoldersResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  rootFolders: z.array(z.custom<RootFolder>()),
})

export const RootFoldersErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  instanceId: z.number().optional(),
})

export const ValidationErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  validation: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    }),
  ),
})
