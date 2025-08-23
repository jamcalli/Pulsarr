import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import { z } from 'zod'

// Base enums matching approval types
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
])
export const ApprovalTriggerSchema = z.enum([
  'quota_exceeded',
  'router_rule',
  'manual_flag',
  'content_criteria',
])

// Shared routing configuration schema
const RoutingConfigSchema = z.object({
  instanceId: z.number(),
  instanceType: z.enum(['radarr', 'sonarr']),
  qualityProfile: z.union([z.number(), z.string(), z.null()]).optional(),
  rootFolder: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.number(),
  searchOnAdd: z.boolean().nullable().optional(),
  seasonMonitoring: z.string().nullable().optional(),
  seriesType: z.enum(['standard', 'anime', 'daily']).nullable().optional(),
  minimumAvailability: z
    .enum(['announced', 'inCinemas', 'released'])
    .optional(),
  syncedInstances: z.array(z.number()).optional(),
})

// Approval data schema matching ApprovalData interface
const ApprovalDataSchema = z.object({
  quotaType: QuotaTypeSchema.optional(),
  quotaUsage: z.number().optional(),
  quotaLimit: z.number().optional(),
  criteriaType: z.string().optional(),
  criteriaValue: z.string().optional(), // Changed from unknown to string for strict typing
  ruleId: z.number().optional(),
  autoApprove: z.boolean().optional(),
})

// Router decision schema
export const RouterDecisionSchema = z.object({
  action: z.enum(['route', 'require_approval', 'reject', 'continue']),
  routing: RoutingConfigSchema.optional(),
  approval: z
    .object({
      reason: z.string(),
      triggeredBy: ApprovalTriggerSchema,
      data: ApprovalDataSchema,
      proposedRouting: RoutingConfigSchema.optional(),
    })
    .optional(),
})

// Approval request schemas
export const CreateApprovalRequestSchema = z.object({
  userId: z.number(),
  contentType: z.enum(['movie', 'show']),
  contentTitle: z.string().min(1).max(255),
  contentKey: z.string().min(1).max(255),
  contentGuids: z.array(z.string()).optional(),
  routerDecision: RouterDecisionSchema,
  routerRuleId: z.number().optional(),
  approvalReason: z.string().optional(),
  triggeredBy: ApprovalTriggerSchema,
  expiresAt: z.string().optional(),
})

export const UpdateApprovalRequestSchema = z.object({
  status: ApprovalStatusSchema.optional(),
  approvedBy: z.number().optional(),
  approvalNotes: z.string().optional(),
  proposedRouterDecision: RouterDecisionSchema.optional(),
})

export const ApprovalRequestResponseSchema = z.object({
  id: z.number(),
  userId: z.number(),
  userName: z.string(),
  contentType: z.enum(['movie', 'show']),
  contentTitle: z.string(),
  contentKey: z.string(),
  contentGuids: z.array(z.string()),
  proposedRouterDecision: RouterDecisionSchema,
  routerRuleId: z.number().nullable(),
  triggeredBy: ApprovalTriggerSchema,
  approvalReason: z.string().nullable(),
  status: ApprovalStatusSchema,
  approvedBy: z.number().nullable(),
  approvalNotes: z.string().nullable(),
  expiresAt: z.string().nullable(),
  // Dynamic expiration fields based on current config
  isExpired: z.boolean().optional(),
  expirationStatus: z.enum(['active', 'expiring_soon', 'expired']).optional(),
  expirationDisplayText: z.string().optional(),
  timeUntilExpiration: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const GetApprovalRequestsQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  userId: z.coerce.number().optional(),
  contentType: z.enum(['movie', 'show']).optional(),
  triggeredBy: ApprovalTriggerSchema.optional(),
  limit: z.coerce.number().min(1).max(1000).default(20),
  offset: z.coerce.number().min(0).default(0),
})

export const ApprovalRequestsListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  approvalRequests: z.array(ApprovalRequestResponseSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

export const ApprovalRequestCreateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  approvalRequest: ApprovalRequestResponseSchema,
})

export const ApprovalRequestUpdateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  approvalRequest: ApprovalRequestResponseSchema,
})

export const ApprovalStatsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  stats: z.object({
    pending: z.number(),
    approved: z.number(),
    rejected: z.number(),
    expired: z.number(),
    totalRequests: z.number(),
  }),
})

export const ApprovalSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type ApprovalSuccessResponse = z.infer<
  typeof ApprovalSuccessResponseSchema
>

// Bulk operation schemas
export const BulkApprovalRequestSchema = z.object({
  requestIds: z
    .array(z.number())
    .min(1, { error: 'At least one request ID is required' }),
  notes: z.string().optional(),
})

export const BulkRejectRequestSchema = z.object({
  requestIds: z
    .array(z.number())
    .min(1, { error: 'At least one request ID is required' }),
  reason: z.string().optional(),
})

export const BulkDeleteRequestSchema = z.object({
  requestIds: z
    .array(z.number())
    .min(1, { error: 'At least one request ID is required' }),
})

export const BulkOperationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  result: z.object({
    successful: z.number(),
    failed: z.array(z.number()),
    errors: z.array(z.string()),
    total: z.number(),
  }),
})

// Type exports
export type RouterDecision = z.infer<typeof RouterDecisionSchema>
export type ProposedRouting = NonNullable<
  NonNullable<RouterDecision['approval']>['proposedRouting']
>
export type CreateApprovalRequest = z.infer<typeof CreateApprovalRequestSchema>
export type UpdateApprovalRequest = z.infer<typeof UpdateApprovalRequestSchema>
export type ApprovalRequestResponse = z.infer<
  typeof ApprovalRequestResponseSchema
>
export type GetApprovalRequestsQuery = z.infer<
  typeof GetApprovalRequestsQuerySchema
>
export type ApprovalRequestsListResponse = z.infer<
  typeof ApprovalRequestsListResponseSchema
>
export type ApprovalRequestCreateResponse = z.infer<
  typeof ApprovalRequestCreateResponseSchema
>
export type ApprovalRequestUpdateResponse = z.infer<
  typeof ApprovalRequestUpdateResponseSchema
>
export type ApprovalStatsResponse = z.infer<typeof ApprovalStatsResponseSchema>

// Bulk operation types
export type BulkApprovalRequest = z.infer<typeof BulkApprovalRequestSchema>
export type BulkRejectRequest = z.infer<typeof BulkRejectRequestSchema>
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>
export type BulkOperationResponse = z.infer<typeof BulkOperationResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ApprovalErrorSchema }
export type ApprovalError = z.infer<typeof ErrorSchema>
