/**
 * Approval System Types
 *
 * Defines types for the approval workflow system that interrupts content acquisition
 * when quotas are exceeded or specific criteria are met, storing router decisions
 * for later execution upon admin approval.
 */

import type { ContentItem } from './router.types.js'

// Database row types
export interface UserQuotaRow {
  id: number
  user_id: number
  quota_type: QuotaType
  quota_limit: number
  bypass_approval: boolean
  created_at: string
  updated_at: string
}

export interface ApprovalRequestRow {
  id: number
  user_id: number
  content_type: 'movie' | 'show'
  content_title: string
  content_key: string
  content_guids: string // JSON array string in DB
  router_decision: string // JSON object string in DB
  router_rule_id?: number
  approval_reason?: string
  triggered_by: ApprovalTrigger
  status: ApprovalStatus
  approved_by?: number
  approval_notes?: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface QuotaUsageRow {
  id: number
  user_id: number
  content_type: 'movie' | 'show'
  request_date: string // YYYY-MM-DD format
  created_at: string
}

// Enums
export type QuotaType = 'daily' | 'weekly_rolling' | 'monthly'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'
export type ApprovalTrigger =
  | 'quota_exceeded'
  | 'router_rule'
  | 'manual_flag'
  | 'content_criteria'

// Extended Router Decision type - builds on existing RoutingDecision
export interface RouterDecision {
  action: 'route' | 'require_approval' | 'reject' | 'continue' // 'continue' = skip this rule and evaluate next router rule

  // Standard routing decision (when action === 'route')
  routing?: {
    instanceId: number
    instanceType: 'radarr' | 'sonarr'
    qualityProfile?: number | string | null
    rootFolder?: string | null
    tags?: string[]
    priority: number
    searchOnAdd?: boolean | null
    seasonMonitoring?: string | null
    seriesType?: 'standard' | 'anime' | 'daily' | null
    minimumAvailability?: 'announced' | 'inCinemas' | 'released'
    syncedInstances?: number[]
  }

  // Approval-specific fields (when action === 'require_approval')
  approval?: {
    reason: string
    triggeredBy: ApprovalTrigger
    data: ApprovalData
    // What routing WOULD have been applied
    proposedRouting?: RouterDecision['routing']
  }
}

// Data attached to approval requirements
export interface ApprovalData {
  quotaType?: QuotaType
  quotaUsage?: number
  quotaLimit?: number
  criteriaType?: string
  criteriaValue?: unknown
  ruleId?: number
  autoApprove?: boolean
}

// Service types
export interface UserQuotaConfig {
  userId: number
  quotaType: QuotaType
  quotaLimit: number
  bypassApproval: boolean
}

export interface ApprovalRequest {
  id: number
  userId: number
  userName: string
  contentType: 'movie' | 'show'
  contentTitle: string
  contentKey: string
  contentGuids: string[]

  // What the router would have decided
  proposedRouterDecision: RouterDecision
  routerRuleId?: number

  // Why approval is needed
  triggeredBy: ApprovalTrigger
  approvalReason?: string

  // Status tracking
  status: ApprovalStatus
  approvedBy?: number
  approvalNotes?: string
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface QuotaUsage {
  userId: number
  contentType: 'movie' | 'show'
  requestDate: string
}

export interface QuotaStatus {
  quotaType: QuotaType
  quotaLimit: number
  currentUsage: number
  exceeded: boolean
  resetDate: string | null
  bypassApproval: boolean
}

export interface QuotaExceeded {
  type: QuotaType
  limit: number
  usage: number
  exceeded: true
}

// Request/Response types for API
export interface CreateApprovalRequestData {
  userId: number
  contentType: 'movie' | 'show'
  contentTitle: string
  contentKey: string
  contentGuids?: string[]
  routerDecision: RouterDecision
  routerRuleId?: number
  approvalReason?: string
  triggeredBy: ApprovalTrigger
  expiresAt?: string | null
}

export interface UpdateApprovalRequestData {
  status?: ApprovalStatus
  approvedBy?: number
  approvalNotes?: string
  proposedRouterDecision?: RouterDecision
}

export interface CreateUserQuotaData {
  userId: number
  quotaType: QuotaType
  quotaLimit: number
  bypassApproval?: boolean
}

export interface UpdateUserQuotaData {
  quotaType?: QuotaType
  quotaLimit?: number
  bypassApproval?: boolean
}

// Approval workflow context
export interface ApprovalContext {
  user: { id: number; name: string }
  content: ContentItem
  routerDecision: RouterDecision
  quotaStatus?: QuotaStatus
  triggerReason: string
}

// Statistics and reporting types
export interface ApprovalStats {
  pending: number
  approved: number
  rejected: number
  expired: number
  totalRequests: number
}

export interface UserApprovalStats {
  userId: number
  userName: string
  totalRequests: number
  approvedRequests: number
  rejectedRequests: number
  pendingRequests: number
  currentQuotaUsage: number
  quotaLimit: number
  quotaType: QuotaType
  bypassApproval: boolean
}
