import type { ApprovalRequest } from '@root/types/approval.types.js'
import { createApprovalEmbed } from '@services/notifications/discord-bot/commands/approval/embeds.js'
import { describe, expect, it } from 'vitest'

function approval(
  triggeredBy: ApprovalRequest['triggeredBy'],
): ApprovalRequest {
  return {
    id: 1,
    userId: 2,
    userName: 'friend',
    contentType: 'movie',
    contentTitle: 'Nosferatu',
    contentKey: 'nosferatu-key',
    contentGuids: ['tmdb:426063'],
    thumb: null,
    proposedRouterDecision: { action: 'require_approval' },
    triggeredBy,
    approvalReason: null,
    status: 'pending',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }
}

function requestInformation(triggeredBy: ApprovalRequest['triggeredBy']) {
  const fields = createApprovalEmbed(approval(triggeredBy), 0, 1).toJSON()
    .fields
  return fields?.find((field) => field.name === 'Request Information')?.value
}

describe('createApprovalEmbed', () => {
  it.each([
    ['quota_exceeded', 'Quota Exceeded'],
    ['manual_flag', 'Manual Flag'],
  ] as const)('labels the %s trigger', (trigger, label) => {
    expect(requestInformation(trigger)).toContain(label)
  })

  it.each(['router_rule', 'content_criteria'] as const)(
    'labels the %s trigger instead of printing the raw key',
    (trigger) => {
      expect(requestInformation(trigger)).not.toContain(trigger)
    },
  )
})
