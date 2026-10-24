import type {
  ConditionNode,
  GroupNode,
  RuleNode,
} from '@/features/library/lib/content-router/condition-tree'
import {
  EMPTY_SUMMARY,
  ruleTokens,
  tokensSentence,
} from '@/features/library/lib/content-router/rule-summary'
import { setFormatLocale } from '@/lib/format'

const root = (overrides: Partial<GroupNode> = {}): GroupNode => ({
  kind: 'group',
  id: 'root',
  parentId: null,
  operator: 'AND',
  negate: false,
  ...overrides,
})

function condition(
  id: string,
  overrides: Partial<ConditionNode>,
  parentId = 'root',
): ConditionNode {
  return {
    kind: 'condition',
    id,
    parentId,
    field: 'genres',
    operator: 'in',
    value: [],
    negate: false,
    ...overrides,
  }
}

const label = (field: string, value: string) =>
  field === 'user' && value === '7' ? 'Alice' : value

describe('tokensSentence', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('joins conditions with the root operator', () => {
    const nodes: RuleNode[] = [
      root(),
      condition('a', { value: ['Anime', 'Animation'] }),
      condition('b', {
        field: 'year',
        operator: 'between',
        value: { min: 2010, max: 2020 },
      }),
    ]

    expect(tokensSentence(ruleTokens(nodes, label))).toBe(
      'Genres is any of Anime, Animation and Year is 2010 to 2020',
    )
  })

  it('uses value labels, units and the vote count', () => {
    const nodes: RuleNode[] = [
      root({ operator: 'OR' }),
      condition('a', { field: 'user', operator: 'equals', value: '7' }),
      condition('b', {
        field: 'imdbRating',
        operator: 'greaterThan',
        value: 7.5,
        votes: 10000,
      }),
      condition('c', {
        field: 'rtCriticRating',
        operator: 'greaterThan',
        value: 80,
      }),
    ]

    expect(tokensSentence(ruleTokens(nodes, label))).toBe(
      'User is Alice or IMDb rating is above 7.5/10 with at least 10,000 votes or RT critic score is above 80%',
    )
  })

  it('flips the phrase for a negated condition and wraps negated groups', () => {
    const nodes: RuleNode[] = [
      root(),
      condition('a', { value: ['Kids'], negate: true }),
      {
        kind: 'group',
        id: 'g',
        parentId: 'root',
        operator: 'OR',
        negate: true,
      },
      condition('b', { field: 'year', operator: 'lessThan', value: 1990 }, 'g'),
      condition(
        'c',
        { field: 'year', operator: 'between', value: { min: 2000 } },
        'g',
      ),
    ]

    expect(tokensSentence(ruleTokens(nodes, label))).toBe(
      'Genres is none of Kids and not (Year is below 1990 or Year is at least 2000)',
    )
  })

  it('skips conditions that are not filled in', () => {
    const nodes: RuleNode[] = [
      root(),
      condition('a', { value: [] }),
      condition('b', { field: 'plexList', operator: 'equals', value: 'Kids' }),
    ]

    expect(tokensSentence(ruleTokens(nodes, label))).toBe('Plex list is Kids')
  })

  it('says so when nothing is filled in', () => {
    expect(
      tokensSentence(ruleTokens([root(), condition('a', {})], label)),
    ).toBe(EMPTY_SUMMARY)
  })
})

describe('ruleTokens', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('types each part of the sentence', () => {
    const nodes: RuleNode[] = [
      root({ negate: true }),
      condition('a', { value: ['Kids'] }),
      {
        kind: 'group',
        id: 'g',
        parentId: 'root',
        operator: 'OR',
        negate: true,
      },
      condition(
        'b',
        { field: 'imdbRating', operator: 'greaterThan', value: 7, votes: 500 },
        'g',
      ),
      condition('c', { field: 'year', operator: 'lessThan', value: 1990 }, 'g'),
    ]

    expect(ruleTokens(nodes, label)).toEqual([
      { kind: 'not', text: 'not' },
      { kind: 'paren', text: '(' },
      { kind: 'field', text: 'Genres' },
      { kind: 'operator', text: 'is any of' },
      { kind: 'value', text: 'Kids' },
      { kind: 'join', text: 'and' },
      { kind: 'not', text: 'not' },
      { kind: 'paren', text: '(' },
      { kind: 'field', text: 'IMDb rating' },
      { kind: 'operator', text: 'is above' },
      { kind: 'value', text: '7/10' },
      { kind: 'operator', text: 'with at least' },
      { kind: 'value', text: '500 votes' },
      { kind: 'join', text: 'or' },
      { kind: 'field', text: 'Year' },
      { kind: 'operator', text: 'is below' },
      { kind: 'value', text: '1990' },
      { kind: 'paren', text: ')' },
      { kind: 'paren', text: ')' },
    ])
    expect(tokensSentence(ruleTokens(nodes, label))).toBe(
      'Not (Genres is any of Kids and not (IMDb rating is above 7/10 with at least 500 votes or Year is below 1990))',
    )
  })

  it('is empty when nothing is filled in', () => {
    expect(ruleTokens([root(), condition('a', {})], label)).toEqual([])
  })
})
