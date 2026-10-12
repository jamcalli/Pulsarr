import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { ArrBaseUrlSchema } from '@root/schemas/common/url.schema.js'
import { z } from 'zod'

export const ArrTestConnectionBodySchema = z
  .object({
    baseUrl: ArrBaseUrlSchema,
    apiKey: z.string().trim().min(1, { error: 'API key is required' }),
  })
  .meta({
    id: 'ArrTestConnectionBody',
    description: 'Radarr or Sonarr address and API key to check before saving',
  })

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
