import {
  evaluatorMetadata,
  isRouterField,
  ROUTER_EVALUATORS,
  ROUTER_FIELD_NAMES,
  ROUTER_FIELDS,
} from '@root/schemas/content-router/router-fields.js'
import { describe, expect, it } from 'vitest'
import pluginsFixture from '../../../fixtures/content-router-plugins.json' with {
  type: 'json',
}

describe('router-fields', () => {
  it('reproduces the metadata route body byte for byte', () => {
    expect(JSON.stringify(evaluatorMetadata())).toBe(
      JSON.stringify(pluginsFixture.metadata.evaluators),
    )
  })

  it('lists the evaluators in the order the plugins route reports', () => {
    expect(
      ROUTER_EVALUATORS.map(({ name, description, priority }) => ({
        name,
        description,
        priority,
      })),
    ).toEqual(pluginsFixture.plugins.plugins)
  })

  it('keys the field table by exactly the field names', () => {
    expect(Object.keys(ROUTER_FIELDS).sort()).toEqual(
      [...ROUTER_FIELD_NAMES].sort(),
    )
  })

  it.each([
    ['year', true],
    ['imdbVotes', true],
    ['condition', false],
    ['toString', false],
    ['unknownField', false],
  ])('isRouterField(%j) is %j', (value, expected) => {
    expect(isRouterField(value)).toBe(expected)
  })
})
