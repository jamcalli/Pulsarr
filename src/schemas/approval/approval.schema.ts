import { ContentTypeSchema } from '@root/schemas/common/content-type.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { InstanceTypeSchema } from '@root/schemas/common/instance-type.schema.js'
import {
  RoutingMonitorSchema,
  RoutingQualityProfileSchema,
  RoutingRootFolderSchema,
  RoutingSearchOnAddSchema,
  RoutingSeasonMonitoringSchema,
  RoutingSeriesTypeSchema,
  RoutingTagsSchema,
} from '@root/schemas/common/routing-target.schema.js'
import { RadarrMinimumAvailabilitySchema } from '@root/schemas/radarr/add-options.schema.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import { z } from 'zod'

export const ApprovalStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'expired', 'auto_approved'])
  .meta({
    id: 'ApprovalStatus',
    description: 'Lifecycle state of an approval request',
  })

export const ApprovalTriggerSchema = z
  .enum(['quota_exceeded', 'router_rule', 'manual_flag', 'content_criteria'])
  .meta({
    id: 'ApprovalTrigger',
    description: 'What caused a request to need approval',
  })

export const ApprovalRoutingSchema = z
  .object({
    instanceId: z.number(),
    instanceType: InstanceTypeSchema,
    qualityProfile: RoutingQualityProfileSchema.optional(),
    rootFolder: RoutingRootFolderSchema.optional(),
    tags: RoutingTagsSchema.optional(),
    priority: z.number(),
    searchOnAdd: RoutingSearchOnAddSchema.optional(),
    seasonMonitoring: RoutingSeasonMonitoringSchema.optional(),
    seriesType: RoutingSeriesTypeSchema.optional(),
    minimumAvailability: RadarrMinimumAvailabilitySchema.optional(),
    monitor: RoutingMonitorSchema.optional(),
    syncedInstances: z.array(z.number()).optional(),
    ruleId: z.number().optional(),
  })
  .meta({
    id: 'ApprovalRouting',
    description: 'Target instance and arr settings used to add the content',
  })

export const ApprovalQuotaDataSchema = z
  .object({
    quotaType: QuotaTypeSchema.optional(),
    quotaUsage: z.number().optional(),
    quotaLimit: z.number().optional(),
    criteriaType: z.string().optional(),
    criteriaValue: z.string().optional(),
    ruleId: z.number().optional(),
    autoApprove: z.boolean().optional(),
  })
  .meta({
    id: 'ApprovalQuotaData',
    description: 'Trigger details captured when the request needed approval',
  })

export const RouterDecisionSchema = z
  .object({
    action: z.enum(['route', 'require_approval', 'reject', 'continue']),
    routing: ApprovalRoutingSchema.optional(),
    approval: z
      .object({
        reason: z.string(),
        triggeredBy: ApprovalTriggerSchema,
        data: ApprovalQuotaDataSchema,
        proposedRouting: ApprovalRoutingSchema.optional(),
        additionalRouting: z.array(ApprovalRoutingSchema).optional(),
      })
      .optional(),
  })
  .meta({
    id: 'RouterDecision',
    description:
      'Router outcome for a request, holding the routing used on approval',
  })

export const APPROVAL_REQUESTS_MAX_LIMIT = 1000

export const ApprovalIdParamsSchema = z.object({
  id: z.coerce.number(),
})

export const CreateApprovalRequestSchema = z
  .object({
    userId: z.number(),
    contentType: ContentTypeSchema,
    contentTitle: z.string().min(1).max(255),
    contentKey: z.string().min(1).max(255),
    contentGuids: z.array(z.string()).optional(),
    routerDecision: RouterDecisionSchema,
    routerRuleId: z.number().optional(),
    approvalReason: z.string().optional(),
    triggeredBy: ApprovalTriggerSchema,
    expiresAt: z.string().optional(),
  })
  .meta({
    id: 'ApprovalRequestCreatePayload',
    description: 'Fields for creating an approval request',
  })

export const UpdateApprovalRequestSchema = z
  .object({
    status: ApprovalStatusSchema.optional(),
    approvalNotes: z.string().optional(),
    proposedRouterDecision: RouterDecisionSchema.optional(),
  })
  .meta({
    id: 'ApprovalRequestUpdatePayload',
    description: 'Fields to change on an approval request',
  })

export const ApprovalExpirationStatusSchema = z
  .enum(['active', 'expiring_soon', 'expired'])
  .meta({
    id: 'ApprovalExpirationStatus',
    description: 'Expiry state computed from the current expiration config',
  })

export const ApprovalRequestResponseSchema = z
  .object({
    id: z.number(),
    userId: z.number(),
    userName: z.string(),
    contentType: ContentTypeSchema,
    contentTitle: z.string(),
    contentKey: z.string(),
    contentGuids: z.array(z.string()),
    thumb: z.string().nullable(),
    proposedRouterDecision: RouterDecisionSchema,
    routerRuleId: z.number().nullable(),
    triggeredBy: ApprovalTriggerSchema,
    approvalReason: z.string().nullable(),
    status: ApprovalStatusSchema,
    approvedBy: z.number().nullable(),
    approvalNotes: z.string().nullable(),
    expiresAt: z.string().nullable(),
    isExpired: z.boolean().optional(),
    expirationStatus: ApprovalExpirationStatusSchema.optional(),
    expirationDisplayText: z.string().optional(),
    timeUntilExpiration: z
      .number()
      .nullable()
      .meta({ description: 'Milliseconds until expiry, negative once expired' })
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({
    id: 'ApprovalRequest',
    description: 'An approval request with its proposed routing and expiry',
  })

export const GetApprovalRequestsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const statuses = val.split(',').filter(Boolean)
      return statuses.length === 1 ? statuses[0] : statuses
    })
    .pipe(
      z.union([ApprovalStatusSchema, z.array(ApprovalStatusSchema)]).optional(),
    )
    .meta({ description: 'One status or a comma-separated list' }),
  userId: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const ids = val
        .split(',')
        .filter(Boolean)
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => !Number.isNaN(id))
      return ids.length === 0 ? undefined : ids.length === 1 ? ids[0] : ids
    })
    .pipe(z.union([z.number(), z.array(z.number())]).optional())
    .meta({ description: 'One user id or a comma-separated list' }),
  contentType: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const types = val.split(',').filter(Boolean)
      return types.length === 1 ? types[0] : types
    })
    .pipe(z.union([ContentTypeSchema, z.array(ContentTypeSchema)]).optional()),
  triggeredBy: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const triggers = val.split(',').filter(Boolean)
      return triggers.length === 1 ? triggers[0] : triggers
    })
    .pipe(
      z
        .union([ApprovalTriggerSchema, z.array(ApprovalTriggerSchema)])
        .optional(),
    ),
  search: z
    .string()
    .meta({ description: 'Case-insensitive partial match on content title' })
    .optional(),
  limit: z.coerce.number().min(1).max(APPROVAL_REQUESTS_MAX_LIMIT).default(20),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z
    .enum([
      'contentTitle',
      'userName',
      'status',
      'triggeredBy',
      'createdAt',
      'expiresAt',
    ])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const ApprovalRequestsListResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    approvalRequests: z.array(ApprovalRequestResponseSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .meta({
    id: 'ApprovalRequestListResponse',
    description: 'One page of approval requests with the total match count',
  })

export const ApprovalRequestResultSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    approvalRequest: ApprovalRequestResponseSchema,
  })
  .meta({
    id: 'ApprovalRequestResult',
    description: 'A single approval request returned by a read or write',
  })

const ApprovalStatsSchema = z
  .object({
    pending: z.number(),
    approved: z.number(),
    rejected: z.number(),
    expired: z.number(),
    auto_approved: z.number(),
    totalRequests: z.number(),
  })
  .meta({
    id: 'ApprovalStats',
    description: 'Approval request counts by status',
  })

export const ApprovalStatsResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    stats: ApprovalStatsSchema,
  })
  .meta({
    id: 'ApprovalStatsResponse',
    description: 'Approval request counts by status',
  })

export const ApprovalSuccessResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .meta({
    id: 'ApprovalSuccessResponse',
    description: 'Outcome of an approval action',
  })

export type ApprovalSuccessResponse = z.infer<
  typeof ApprovalSuccessResponseSchema
>

const BulkRequestIdsSchema = z
  .array(z.number())
  .min(1, { error: 'At least one request ID is required' })

export const BulkApprovalRequestSchema = z
  .object({
    requestIds: BulkRequestIdsSchema,
    notes: z.string().optional(),
  })
  .meta({
    id: 'ApprovalBulkApprovePayload',
    description: 'Approval requests to approve, with optional notes',
  })

export const BulkRejectRequestSchema = z
  .object({
    requestIds: BulkRequestIdsSchema,
    reason: z.string().optional(),
  })
  .meta({
    id: 'ApprovalBulkRejectPayload',
    description: 'Approval requests to reject, with an optional reason',
  })

export const BulkDeleteRequestSchema = z
  .object({
    requestIds: BulkRequestIdsSchema,
  })
  .meta({
    id: 'ApprovalBulkDeletePayload',
    description: 'Approval requests to delete',
  })

const ApprovalBulkResultSchema = z
  .object({
    successful: z.number(),
    failed: z
      .array(z.number())
      .meta({ description: 'Request ids that could not be processed' }),
    errors: z.array(z.string()),
    total: z.number(),
  })
  .meta({
    id: 'ApprovalBulkResult',
    description: 'Per-request outcome counts of a bulk approval operation',
  })

export const BulkOperationResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    result: ApprovalBulkResultSchema,
  })
  .meta({
    id: 'ApprovalBulkOperationResponse',
    description: 'Result of a bulk approve, reject or delete',
  })

export type RouterDecision = z.infer<typeof RouterDecisionSchema>
export type ProposedRouting = NonNullable<
  NonNullable<RouterDecision['approval']>['proposedRouting']
>
export type ApprovalIdParams = z.infer<typeof ApprovalIdParamsSchema>
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
export type ApprovalRequestResult = z.infer<typeof ApprovalRequestResultSchema>
export type ApprovalStatsResponse = z.infer<typeof ApprovalStatsResponseSchema>

export type BulkApprovalRequest = z.infer<typeof BulkApprovalRequestSchema>
export type BulkRejectRequest = z.infer<typeof BulkRejectRequestSchema>
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>
export type BulkOperationResponse = z.infer<typeof BulkOperationResponseSchema>

export { ErrorSchema as ApprovalErrorSchema }
export type ApprovalError = z.infer<typeof ErrorSchema>
