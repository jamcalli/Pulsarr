import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const ArrConnectionFailureCodeSchema = z
  .enum(['unreachable', 'auth', 'invalid', 'webhook_callback_failed'])
  .meta({
    id: 'ArrConnectionFailureCode',
    description: 'Why a Radarr or Sonarr connection check failed',
  })

export const ArrTestConnectionResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    code: ArrConnectionFailureCodeSchema.nullable(),
  })
  .meta({
    id: 'ArrTestConnectionResponse',
    description:
      'Radarr or Sonarr connection test result, code is null on success',
  })

export const ArrInstanceConflictSchema = ErrorSchema.extend({
  code: ArrConnectionFailureCodeSchema,
}).meta({
  id: 'ArrInstanceConflict',
  description:
    'Instance save rejected because the arr could not reach the Pulsarr webhook',
})

export type ArrConnectionFailureCode = z.infer<
  typeof ArrConnectionFailureCodeSchema
>
export type ArrTestConnectionResponse = z.infer<
  typeof ArrTestConnectionResponseSchema
>
