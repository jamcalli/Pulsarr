import type { ApprovalRequest } from '@root/types/approval.types.js'
import {
  createApprovalEmbed,
  createDetailsEmbed,
} from '@services/notifications/discord-bot/commands/approval/embeds.js'
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
    ['quota_exceeded', 'Quota exceeded'],
    ['manual_flag', 'Manual flag'],
    ['router_rule', 'Router rule'],
    ['content_criteria', 'Content criteria'],
  ] as const)('labels the %s trigger', (trigger, label) => {
    expect(requestInformation(trigger)).toContain(label)
  })

  it('titles the card with the event and content', () => {
    expect(
      createApprovalEmbed(approval('manual_flag'), 0, 1).toJSON().title,
    ).toBe('Approval request: Nosferatu')
  })
})

describe('createDetailsEmbed', () => {
  it('titles the detail view with the event and content', () => {
    expect(createDetailsEmbed(approval('manual_flag')).toJSON().title).toBe(
      'Approval request: Nosferatu',
    )
  })
})
