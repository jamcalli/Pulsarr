import {
  ROUTER_GROUP_MAX_CONDITIONS,
  ROUTER_GROUP_MAX_DEPTH,
} from '@root/schemas/content-router/content-router.schema'
import {
  type ConditionField,
  type ConditionOperator,
  isConditionOperator,
} from '@/features/library/lib/content-router/condition-fields'
import type { components } from '@/types/api.js'

export type ConditionRange = components['schemas']['ConditionRange']

/** A condition value as its control edits it, so chips hold strings and an empty number input is undefined. */
export type DraftValue =
  | string
  | number
  | string[]
  | ConditionRange
  | null
  | undefined

export interface ConditionNode {
  kind: 'condition'
  id: string
  parentId: string
  field: string
  operator: ConditionOperator
  value: DraftValue
  /** Minimum vote count, only for fields in VOTE_FIELDS. */
  votes?: number
  negate: boolean
}

export interface GroupNode {
  kind: 'group'
  id: string
  /** Null only on the root group, which is always the first node. */
  parentId: string | null
  operator: components['schemas']['RouterGroupOperator']
  negate: boolean
}

export type RuleNode = ConditionNode | GroupNode

export const ROOT_ID = 'root'

let sequence = 0

export function nextNodeId(): string {
  sequence += 1
  return `node-${sequence}`
}

export function childrenOf(
  nodes: readonly RuleNode[],
  parentId: string,
): RuleNode[] {
  return nodes.filter((node) => node.parentId === parentId)
}

export function isGroupFull(
  nodes: readonly RuleNode[],
  groupId: string,
): boolean {
  return childrenOf(nodes, groupId).length >= ROUTER_GROUP_MAX_CONDITIONS
}

export function emptyDraftValue(
  kind: 'chips' | 'range' | 'number' | 'select' | 'text',
): DraftValue {
  if (kind === 'chips') return []
  if (kind === 'range') return {}
  if (kind === 'number') return undefined
  return ''
}

/** A blank condition on the first field, or on no field when the metadata has not loaded. */
export function blankCondition(
  parentId: string,
  fields: readonly ConditionField[],
  emptyValue: (field: string, operator: ConditionOperator) => DraftValue,
): ConditionNode {
  const field = fields[0]
  const operator =
    field?.operators
      .map((candidate) => candidate.name)
      .find(isConditionOperator) ?? 'equals'
  const name = field?.name ?? ''
  return {
    kind: 'condition',
    id: nextNodeId(),
    parentId,
    field: name,
    operator,
    value: emptyValue(name, operator),
    votes: undefined,
    negate: false,
  }
}

export function rootGroup(): GroupNode {
  return {
    kind: 'group',
    id: ROOT_ID,
    parentId: null,
    operator: 'AND',
    negate: false,
  }
}

function descendantIds(nodes: readonly RuleNode[], id: string): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (
        node.parentId !== null &&
        ids.has(node.parentId) &&
        !ids.has(node.id)
      ) {
        ids.add(node.id)
        grew = true
      }
    }
  }
  return ids
}

/** Removes the node with its descendants, drops groups it leaves empty, and keeps one condition in the root. */
export function removeNode(
  nodes: readonly RuleNode[],
  id: string,
  blank: (parentId: string) => ConditionNode,
): RuleNode[] {
  let next = nodes.filter((node) => !descendantIds(nodes, id).has(node.id))
  let parentId = nodes.find((node) => node.id === id)?.parentId ?? null
  while (
    parentId !== null &&
    parentId !== ROOT_ID &&
    childrenOf(next, parentId).length === 0
  ) {
    const emptyId: string = parentId
    parentId = next.find((node) => node.id === emptyId)?.parentId ?? null
    next = next.filter((node) => node.id !== emptyId)
  }
  return childrenOf(next, ROOT_ID).length === 0
    ? [...next, blank(ROOT_ID)]
    : next
}

/** The nesting level of a group, the root being level 0. */
export function groupDepth(
  nodes: readonly RuleNode[],
  groupId: string,
): number {
  let depth = 0
  let parentId = nodes.find((node) => node.id === groupId)?.parentId ?? null
  while (parentId !== null) {
    depth += 1
    const currentId: string = parentId
    parentId = nodes.find((node) => node.id === currentId)?.parentId ?? null
  }
  return depth
}

/** True when a group under `groupId` would nest deeper than the server accepts. */
export function isGroupAtMaxDepth(
  nodes: readonly RuleNode[],
  groupId: string,
): boolean {
  return groupDepth(nodes, groupId) >= ROUTER_GROUP_MAX_DEPTH
}

/** A new OR group holding two blank conditions, appended under `parentId`. */
export function groupWithConditions(
  parentId: string,
  blank: (parentId: string) => ConditionNode,
): RuleNode[] {
  const group: GroupNode = {
    kind: 'group',
    id: nextNodeId(),
    parentId,
    operator: 'OR',
    negate: false,
  }
  return [group, blank(group.id), blank(group.id)]
}
