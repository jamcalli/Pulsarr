import { z } from 'zod'

export const QuerystringSchema = z.object({
  instanceId: z.string(),
})

export const InstanceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  baseUrl: z.string(),
})

export const RootFoldersResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  rootFolders: z.array(z.any()),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

export type Querystring = z.infer<typeof QuerystringSchema>
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>
export type RootFoldersResponse = z.infer<typeof RootFoldersResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
