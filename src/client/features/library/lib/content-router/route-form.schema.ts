import {
  BaseRouterRuleSchema,
  ComparisonOperatorSchema,
  ConditionSchema,
  RouterGroupOperatorSchema,
  RouterRulePrioritySchema,
} from '@root/schemas/content-router/content-router.schema'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema'
import { z } from 'zod'
import type { DraftValue } from '@/features/library/lib/content-router/condition-tree'
import { payloadCondition } from '@/features/library/lib/content-router/route-form'

const rule = BaseRouterRuleSchema.shape

const REGEX_ERROR = 'Not a valid pattern, or one that could run forever.'

const GroupNodeSchema = z.object({
  kind: z.literal('group'),
  id: z.string(),
  parentId: z.string().nullable(),
  operator: RouterGroupOperatorSchema,
  negate: z.boolean(),
})

const ConditionNodeSchema = z
  .object({
    kind: z.literal('condition'),
    id: z.string(),
    parentId: z.string(),
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: z.custom<DraftValue>(),
    votes: z.number().optional(),
    negate: z.boolean(),
  })
  .superRefine((node, ctx) => {
    if (
      node.operator === 'regex' &&
      typeof node.value === 'string' &&
      !isRegexPatternSafe(node.value)
    ) {
      ctx.addIssue({ code: 'custom', message: REGEX_ERROR })
      return
    }
    const result = ConditionSchema.safeParse(payloadCondition(node, false))
    const issue = result.error?.issues[0]
    if (issue) ctx.addIssue({ code: 'custom', message: issue.message })
  })

export const RouteFormSchema = z.object({
  name: rule.name,
  order: RouterRulePrioritySchema,
  action: z.enum(['route', 'exclude']),
  routing: z.object({
    instanceId: z.string(),
    qualityProfile: z.string().nullable(),
    rootFolder: rule.root_folder.unwrap(),
    tags: rule.tags.unwrap(),
    searchOnAdd: rule.search_on_add.unwrap(),
    seasonMonitoring: rule.season_monitoring.unwrap(),
    seriesType: rule.series_type.unwrap(),
    monitor: rule.monitor.unwrap(),
  }),
  always_require_approval: rule.always_require_approval.unwrap(),
  approval_reason: rule.approval_reason.unwrap(),
  bypass_user_quotas: rule.bypass_user_quotas.unwrap(),
  conditions: z.array(
    z.discriminatedUnion('kind', [GroupNodeSchema, ConditionNodeSchema]),
  ),
})
