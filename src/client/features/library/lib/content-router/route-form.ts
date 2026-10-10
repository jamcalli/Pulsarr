import { DEFAULT_ROUTE_PRIORITY } from '@root/schemas/content-router/content-router.schema'
import type { Condition, ConditionGroup } from '@root/types/router.types'
import type { RoutingFieldValues } from '@/components/routing-fields'
import {
  type ConditionOperator,
  isConditionOperator,
  type RouteType,
  VOTE_FIELDS,
} from '@/features/library/lib/content-router/condition-fields'
import {
  blankCondition,
  type ConditionNode,
  type ConditionRange,
  childrenOf,
  type DraftValue,
  type GroupNode,
  nextNodeId,
  ROOT_ID,
  type RuleNode,
  rootGroup,
} from '@/features/library/lib/content-router/condition-tree'
import {
  storedScalar,
  type ValueControl,
} from '@/features/library/lib/content-router/value-control'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']
type RouterCondition = components['schemas']['RouterCondition']
type ConditionValue = components['schemas']['ConditionValue']
type StoredNode = Condition | ConditionGroup

export type RouteAction = 'route' | 'exclude'

export type RouteRoutingValues = Omit<RoutingFieldValues, 'minimumAvailability'>

export interface RouteFormValues {
  name: string
  order: number | undefined
  action: RouteAction
  routing: RouteRoutingValues
  always_require_approval: boolean
  approval_reason: string
  bypass_user_quotas: boolean
  conditions: RuleNode[]
}

/** Resolves the control for a field and operator, or null when the metadata does not know the field. */
export type ControlResolver = (
  field: string,
  operator: ConditionOperator,
) => ValueControl | null

export type NumericResolver = (
  field: string,
  operator: ConditionOperator,
) => boolean

/** Every instance-scoped field inherits and tags are empty, the state of a new route and of an instance switch. */
export function inheritRouting(instanceId: string): RouteRoutingValues {
  return {
    instanceId,
    qualityProfile: null,
    rootFolder: null,
    tags: [],
    searchOnAdd: null,
    seasonMonitoring: null,
    seriesType: null,
    monitor: null,
  }
}

function ruleRouting(
  rule: RouterRule,
  defaults: RouteRoutingValues,
): RouteRoutingValues {
  if (rule.exclude_from_routing || rule.target_instance_id === null) {
    return defaults
  }
  return {
    instanceId: String(rule.target_instance_id),
    qualityProfile:
      rule.quality_profile == null || rule.quality_profile === ''
        ? null
        : String(rule.quality_profile),
    rootFolder: rule.root_folder || null,
    tags: rule.tags ?? [],
    searchOnAdd: rule.search_on_add ?? null,
    seasonMonitoring: rule.season_monitoring ?? null,
    seriesType: rule.series_type ?? null,
    monitor: rule.monitor ?? null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && isConditionOperator(value)
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function rangeOf(value: unknown): ConditionRange {
  if (!isRecord(value)) return {}
  return {
    ...(typeof value.min === 'number' ? { min: value.min } : {}),
    ...(typeof value.max === 'number' ? { max: value.max } : {}),
  }
}

/** Reads a stored value into the shape its control edits, so a scalar becomes one chip and a list keeps every entry. */
export function draftValue(
  value: unknown,
  control: ValueControl | null,
): DraftValue {
  if (control === null) {
    if (Array.isArray(value)) {
      return value.flatMap((item) => scalarText(item) ?? [])
    }
    if (isRecord(value)) return rangeOf(value)
    if (typeof value === 'string' || typeof value === 'number') return value
    return null
  }
  switch (control.kind) {
    case 'chips': {
      if (Array.isArray(value)) {
        return value.flatMap((item) => scalarText(item) ?? [])
      }
      const text = scalarText(value)
      return text === null ? [] : [text]
    }
    case 'range':
      return rangeOf(value)
    case 'number': {
      if (typeof value === 'number') return value
      const parsed = typeof value === 'string' ? Number(value) : Number.NaN
      return Number.isFinite(parsed) ? parsed : undefined
    }
    case 'select':
    case 'text':
      return scalarText(value) ?? ''
  }
}

const LIST_OPERATORS: Partial<Record<ConditionOperator, ConditionOperator>> = {
  equals: 'in',
  notEquals: 'notIn',
}

/** The server reads user equals with a list as in, so such a stored condition loads as the list operator. */
function storedOperator(
  field: string,
  operator: ConditionOperator,
  value: unknown,
): ConditionOperator {
  const list = LIST_OPERATORS[operator]
  return field === 'user' && Array.isArray(value) && list !== undefined
    ? list
    : operator
}

function isStoredGroup(node: StoredNode): node is ConditionGroup {
  return 'conditions' in node && Array.isArray(node.conditions)
}

function readNodes(
  item: StoredNode,
  parentId: string,
  resolve: ControlResolver,
): RuleNode[] {
  if (typeof item !== 'object' || item === null) return []
  if (
    isStoredGroup(item) &&
    (item.operator === 'AND' || item.operator === 'OR')
  ) {
    const group: GroupNode = {
      kind: 'group',
      id: nextNodeId(),
      parentId,
      operator: item.operator,
      negate: item.negate === true,
    }
    return [
      group,
      ...item.conditions.flatMap((child) =>
        readNodes(child, group.id, resolve),
      ),
    ]
  }
  if (
    !('field' in item) ||
    typeof item.field !== 'string' ||
    !isOperator(item.operator)
  ) {
    return []
  }
  const compound =
    VOTE_FIELDS.has(item.field) &&
    isRecord(item.value) &&
    ('rating' in item.value || 'votes' in item.value)
      ? item.value
      : null
  const rawValue = compound ? compound.rating : item.value
  const votes = compound?.votes
  const operator = storedOperator(item.field, item.operator, rawValue)
  return [
    {
      kind: 'condition',
      id: nextNodeId(),
      parentId,
      field: item.field,
      operator,
      value: draftValue(rawValue, resolve(item.field, operator)),
      votes: typeof votes === 'number' ? votes : undefined,
      negate: item.negate === true,
    },
  ]
}

/** Flattens a stored condition into nodes under one root group, adding a blank condition when the root is empty. */
export function conditionNodes(
  condition: RouterRule['condition'],
  resolve: ControlResolver,
  blank: (parentId: string) => ConditionNode,
): RuleNode[] {
  // The contract flattens nested groups to unknown[], so the walk reads the recursive server shape.
  const stored = condition as StoredNode | undefined
  const root = rootGroup()
  let children: RuleNode[] = []
  if (typeof stored === 'object' && stored !== null && isStoredGroup(stored)) {
    root.operator = stored.operator
    root.negate = stored.negate === true
    children = stored.conditions.flatMap((child) =>
      readNodes(child, ROOT_ID, resolve),
    )
  } else if (stored !== undefined) {
    children = readNodes(stored, ROOT_ID, resolve)
  }
  return children.some((node) => node.parentId === ROOT_ID)
    ? [root, ...children]
    : [root, ...children, blank(ROOT_ID)]
}

export function ruleFormValues(
  rule: RouterRule | null,
  {
    routingDefaults,
    resolve,
    blank,
  }: {
    /** Defaults for the given instance id, falling back to the default instance when it is missing. */
    routingDefaults: (instanceId: number | null) => RouteRoutingValues
    resolve: ControlResolver
    blank: (parentId: string) => ConditionNode
  },
): RouteFormValues {
  if (rule === null) {
    return {
      name: '',
      order: DEFAULT_ROUTE_PRIORITY,
      action: 'route',
      routing: routingDefaults(null),
      always_require_approval: false,
      approval_reason: '',
      bypass_user_quotas: false,
      conditions: conditionNodes(undefined, resolve, blank),
    }
  }
  return {
    name: rule.name,
    order: rule.order ?? DEFAULT_ROUTE_PRIORITY,
    action: rule.exclude_from_routing ? 'exclude' : 'route',
    routing: ruleRouting(rule, routingDefaults(rule.target_instance_id)),
    always_require_approval: rule.always_require_approval ?? false,
    approval_reason: rule.approval_reason ?? '',
    bypass_user_quotas: rule.bypass_user_quotas ?? false,
    conditions: conditionNodes(rule.condition, resolve, blank),
  }
}

function ratingValue(
  value: ConditionValue,
): number | number[] | ConditionRange | undefined {
  if (typeof value === 'number') return value
  if (Array.isArray(value)) {
    const items: ReadonlyArray<unknown> = value
    return items.flatMap((item) => {
      const rating = typeof item === 'string' ? storedScalar(item, true) : item
      return typeof rating === 'number' ? [rating] : []
    })
  }
  if (isRecord(value) && !('rating' in value)) return rangeOf(value)
  return undefined
}

/** The value sent for one condition, with the vote count folded into a rating object when it is set. */
export function conditionValue(
  node: ConditionNode,
  numeric: boolean,
): ConditionValue {
  const { value } = node
  let base: ConditionValue
  if (Array.isArray(value)) {
    base = value.map((item) => storedScalar(item, numeric))
  } else if (typeof value === 'string') {
    base = storedScalar(value, numeric)
  } else if (typeof value === 'number') {
    base = value
  } else if (value == null) {
    base = null
  } else {
    base = rangeOf(value)
  }
  if (!VOTE_FIELDS.has(node.field) || node.votes === undefined) return base
  const rating = ratingValue(base)
  return rating === undefined
    ? { votes: node.votes }
    : { rating, votes: node.votes }
}

export function payloadCondition(
  node: ConditionNode,
  numeric: boolean,
): RouterCondition {
  return {
    field: node.field,
    operator: node.operator,
    value: conditionValue(node, numeric),
    negate: node.negate,
  }
}

interface PayloadGroup {
  operator: components['schemas']['RouterGroupOperator']
  negate: boolean
  conditions: Array<RouterCondition | PayloadGroup>
}

export function conditionTree(
  nodes: readonly RuleNode[],
  numeric: NumericResolver,
  groupId: string = ROOT_ID,
): PayloadGroup {
  const group = nodes.find(
    (node): node is GroupNode => node.kind === 'group' && node.id === groupId,
  )
  return {
    operator: group?.operator ?? 'AND',
    negate: group?.negate ?? false,
    conditions: childrenOf(nodes, groupId).map((node) =>
      node.kind === 'group'
        ? conditionTree(nodes, numeric, node.id)
        : payloadCondition(node, numeric(node.field, node.operator)),
    ),
  }
}

function profileId(value: string | null): number | null {
  return value === null ? null : Number(value)
}

export function rulePayload(
  values: RouteFormValues,
  {
    type,
    enabled,
    numeric,
  }: { type: RouteType; enabled: boolean; numeric: NumericResolver },
): RouterRulePayload {
  const exclude = values.action === 'exclude'
  const { routing } = values
  const approval = !exclude && values.always_require_approval
  return {
    name: values.name,
    target_type: type,
    target_instance_id: exclude ? null : Number(routing.instanceId),
    quality_profile: exclude ? undefined : profileId(routing.qualityProfile),
    root_folder: exclude ? undefined : routing.rootFolder,
    tags: exclude ? [] : routing.tags,
    enabled,
    order: values.order,
    condition: conditionTree(values.conditions, numeric),
    search_on_add: exclude ? undefined : routing.searchOnAdd,
    season_monitoring: type === 'sonarr' ? routing.seasonMonitoring : undefined,
    series_type: type === 'sonarr' ? routing.seriesType : undefined,
    monitor: type === 'radarr' ? routing.monitor : undefined,
    always_require_approval: approval,
    approval_reason: approval ? values.approval_reason : undefined,
    bypass_user_quotas: !exclude && values.bypass_user_quotas,
    exclude_from_routing: exclude,
  }
}

export function usesField(
  condition: RouterRule['condition'],
  field: string,
): boolean {
  return conditionNodes(
    condition,
    () => null,
    (parentId) => blankCondition(parentId, [], () => null),
  ).some((node) => node.kind === 'condition' && node.field === field)
}
