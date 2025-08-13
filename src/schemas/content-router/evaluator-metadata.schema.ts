import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Schema for field information
export const FieldInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  valueTypes: z.array(z.string()),
})

// Schema for operator information
export const OperatorInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  valueTypes: z.array(z.string()),
  valueFormat: z.string().optional(),
})

// Schema for evaluator metadata
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

// Response schema for evaluator metadata
export const EvaluatorMetadataResponseSchema = z.object({
  success: z.boolean(),
  evaluators: z.array(EvaluatorMetadataSchema),
})

// Re-export shared error schema
export { ErrorSchema as EvaluatorMetadataErrorSchema }

// Export types
export type FieldInfo = z.infer<typeof FieldInfoSchema>
export type OperatorInfo = z.infer<typeof OperatorInfoSchema>
export type EvaluatorMetadata = z.infer<typeof EvaluatorMetadataSchema>
export type EvaluatorMetadataResponse = z.infer<
  typeof EvaluatorMetadataResponseSchema
>
export type EvaluatorMetadataError = z.infer<typeof ErrorSchema>
