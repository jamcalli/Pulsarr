import { ROUTER_GROUP_MAX_DEPTH } from '@root/schemas/content-router/content-router.schema'
import {
  type ConditionNode,
  childrenOf,
  type GroupNode,
  groupDepth,
  groupWithConditions,
  isGroupAtMaxDepth,
  ROOT_ID,
  type RuleNode,
  removeNode,
  rootGroup,
} from '@/features/library/lib/content-router/condition-tree'

function blank(parentId: string): ConditionNode {
  return {
    kind: 'condition',
    id: `c-${parentId}-${Math.random()}`,
    parentId,
    field: 'genres',
    operator: 'in',
    value: [],
    negate: false,
  }
}

function group(id: string, parentId: string): GroupNode {
  return { kind: 'group', id, parentId, operator: 'AND', negate: false }
}

describe('groupWithConditions', () => {
  it('adds an OR group with two blank conditions under a nested group', () => {
    const nodes: RuleNode[] = [
      rootGroup(),
      group('outer', ROOT_ID),
      blank('outer'),
    ]
    const added = groupWithConditions('outer', blank)
    const next = [...nodes, ...added]
    const inner = added[0]

    expect(inner).toMatchObject({
      kind: 'group',
      parentId: 'outer',
      operator: 'OR',
    })
    expect(childrenOf(next, inner.id)).toHaveLength(2)
    expect(childrenOf(next, 'outer').map((node) => node.kind)).toEqual([
      'condition',
      'group',
    ])
    expect(groupDepth(next, inner.id)).toBe(2)
  })
})

describe('isGroupAtMaxDepth', () => {
  it('stops at the server nesting cap', () => {
    const nodes: RuleNode[] = [rootGroup()]
    let parentId = ROOT_ID
    for (let level = 1; level <= ROUTER_GROUP_MAX_DEPTH; level += 1) {
      const id = `g${level}`
      nodes.push(group(id, parentId))
      parentId = id
    }

    expect(isGroupAtMaxDepth(nodes, `g${ROUTER_GROUP_MAX_DEPTH - 1}`)).toBe(
      false,
    )
    expect(isGroupAtMaxDepth(nodes, `g${ROUTER_GROUP_MAX_DEPTH}`)).toBe(true)
  })
})

describe('removeNode', () => {
  it('drops a nested group with its children and any group it empties', () => {
    const inner = group('inner', 'outer')
    const nodes: RuleNode[] = [
      rootGroup(),
      blank(ROOT_ID),
      group('outer', ROOT_ID),
      inner,
      blank('inner'),
    ]

    const next = removeNode(nodes, 'inner', blank)

    expect(next.map((node) => node.id)).toEqual([ROOT_ID, nodes[1].id])
  })
})
