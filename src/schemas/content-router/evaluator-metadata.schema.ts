import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const FieldInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  valueTypes: z.array(z.string()),
})

export const OperatorInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  valueTypes: z.array(z.string()),
  valueFormat: z.string().optional(),
})

export const EvaluatorMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  priority: z.number(),
  supportedFields: z.array(FieldInfoSchema).default([]),
  supportedOperators: z
    .record(z.string(), z.array(OperatorInfoSchema))
    .default({}),
  contentType: z.enum(['radarr', 'sonarr', 'both']).optional(),
})

export const EvaluatorMetadataResponseSchema = z.object({
  success: z.boolean(),
  evaluators: z.array(EvaluatorMetadataSchema),
})

export { ErrorSchema as EvaluatorMetadataErrorSchema }

export type FieldInfo = z.infer<typeof FieldInfoSchema>
export type OperatorInfo = z.infer<typeof OperatorInfoSchema>
export type EvaluatorMetadata = z.infer<typeof EvaluatorMetadataSchema>
export type EvaluatorMetadataResponse = z.infer<
  typeof EvaluatorMetadataResponseSchema
>
export type EvaluatorMetadataError = z.infer<typeof ErrorSchema>
