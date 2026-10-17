import type {
  NotificationTestOutcome,
  NotificationTestResult,
} from '@root/types/notification.types.js'

export async function timeTest(
  run: () => Promise<NotificationTestOutcome>,
): Promise<NotificationTestResult> {
  const startedAt = Date.now()
  const outcome = await run()
  return { ...outcome, responseTime: Date.now() - startedAt }
}
