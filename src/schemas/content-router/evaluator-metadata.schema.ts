import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { ComparisonOperatorSchema } from '@root/schemas/content-router/content-router.schema.js'
import { CONDITION_VALUE_TYPES } from '@root/schemas/content-router/router-fields.js'
import { z } from 'zod'

export const ConditionValueTypeSchema = z.enum(CONDITION_VALUE_TYPES).meta({
  id: 'ConditionValueType',
  description: 'Value shape a condition field or operator accepts',
})

// Schema for field information
export const FieldInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  valueTypes: z.array(ConditionValueTypeSchema),
})

// Schema for operator information
export const OperatorInfoSchema = z.object({
  name: ComparisonOperatorSchema,
  description: z.string(),
  valueTypes: z.array(ConditionValueTypeSchema),
  valueFormat: z.string().optional(),
})

// Schema for evaluator metadata
export const EvaluatorMetadataSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    priority: z.number(),
    supportedFields: z.array(FieldInfoSchema).default([]),
    supportedOperators: z
      .record(z.string(), z.array(OperatorInfoSchema))
      .default({}),
    contentType: z.enum(['radarr', 'sonarr', 'both']).optional(),
  })
  .meta({
    id: 'EvaluatorMetadata',
    description:
      'Field and operator metadata an evaluator contributes to the rule builder',
  })

// Response schema for evaluator metadata
export const EvaluatorMetadataResponseSchema = z.object({
  success: z.boolean(),
  evaluators: z.array(EvaluatorMetadataSchema),
})

// Re-export shared error schema
export { ErrorSchema as EvaluatorMetadataErrorSchema }

// Export types
export type EvaluatorMetadata = z.infer<typeof EvaluatorMetadataSchema>
export type EvaluatorMetadataResponse = z.infer<
  typeof EvaluatorMetadataResponseSchema
>
export type EvaluatorMetadataError = z.infer<typeof ErrorSchema>
