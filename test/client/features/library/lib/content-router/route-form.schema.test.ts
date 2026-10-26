import { conditionNodes } from '@/features/library/lib/content-router/route-form'
import { routeFormSchema } from '@/features/library/lib/content-router/route-form.schema'
import { resolvers } from '../../content-router-fixtures.js'

const { controlFor, blank } = resolvers()

function values(overrides: object = {}) {
  return {
    name: 'Anime',
    action: 'route',
    routing: {
      instanceId: '1',
      qualityProfile: '4',
      rootFolder: '/movies',
      tags: [],
      searchOnAdd: true,
      seasonMonitoring: 'all',
      seriesType: 'standard',
      monitor: 'movieOnly',
    },
    always_require_approval: false,
    approval_reason: '',
    bypass_user_quotas: false,
    conditions: conditionNodes(
      {
        operator: 'AND',
        negate: false,
        conditions: [
          { field: 'genres', operator: 'in', value: ['Anime'], negate: false },
        ],
      },
      controlFor,
      blank,
    ),
    ...overrides,
  }
}

function messages(input: object) {
  const result = routeFormSchema().safeParse(input)
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

describe('routeFormSchema', () => {
  it('accepts a complete route', () => {
    expect(messages(values())).toEqual([])
  })

  it('requires a name', () => {
    expect(messages(values({ name: '' }))).toEqual([
      { path: 'name', message: 'Name is required' },
    ])
  })

  it('reports an incomplete condition on its node', () => {
    expect(
      messages(
        values({ conditions: conditionNodes(undefined, controlFor, blank) }),
      ),
    ).toEqual([
      {
        path: 'conditions.1',
        message: 'Condition must have field, operator, and value',
      },
    ])
  })

  it('accepts inherit on every instance-scoped field', () => {
    const inherit = {
      ...values().routing,
      qualityProfile: null,
      rootFolder: null,
      searchOnAdd: null,
      seasonMonitoring: null,
      seriesType: null,
      monitor: null,
    }
    expect(messages(values({ routing: inherit }))).toEqual([])
  })

  it('words an unsafe pattern for people', () => {
    const conditions = conditionNodes(
      {
        operator: 'AND',
        negate: false,
        conditions: [
          {
            field: 'genres',
            operator: 'regex',
            value: '(a+)+$',
            negate: false,
          },
        ],
      },
      controlFor,
      blank,
    )
    expect(messages(values({ conditions }))).toEqual([
      {
        path: 'conditions.1',
        message: 'Not a valid pattern, or one that could run forever.',
      },
    ])
  })
})
