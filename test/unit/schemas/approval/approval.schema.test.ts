import {
  canTransitionApproval,
  isApprovalEditable,
} from '@root/schemas/approval/approval.schema.js'
import { describe, expect, it } from 'vitest'

describe('approval transitions', () => {
  it.each([
    ['pending', 'approved', true],
    ['pending', 'rejected', true],
    ['rejected', 'approved', true],
    ['rejected', 'rejected', false],
    ['pending', 'pending', false],
    ['approved', 'approved', false],
    ['approved', 'rejected', false],
    ['expired', 'approved', false],
    ['expired', 'rejected', false],
    ['auto_approved', 'approved', false],
    ['auto_approved', 'rejected', false],
  ] as const)('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransitionApproval(from, to)).toBe(allowed)
  })

  it.each([
    ['pending', true],
    ['rejected', true],
    ['approved', false],
    ['expired', false],
    ['auto_approved', false],
  ] as const)('%s editable is %s', (status, editable) => {
    expect(isApprovalEditable(status)).toBe(editable)
  })
})
