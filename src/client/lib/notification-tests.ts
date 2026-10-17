import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type TestResult = components['schemas']['TestResult']

export async function testDiscordWebhook(url: string): Promise<TestResult> {
  const { data, error } = await apiFetch.POST(
    '/v1/notifications/test/discord-webhook',
    { body: { url } },
  )
  if (error) throw error
  return data
}

export async function testApprise(url: string): Promise<TestResult> {
  const { data, error } = await apiFetch.POST(
    '/v1/notifications/test/apprise',
    { body: { url } },
  )
  if (error) throw error
  return data
}

export async function testDiscordDm(discordId: string): Promise<TestResult> {
  const { data, error } = await apiFetch.POST(
    '/v1/notifications/test/discord-dm',
    { body: { discordId } },
  )
  if (error) throw error
  return data
}

export async function testSystemTarget(
  target: components['schemas']['SystemTestPayload']['target'],
): Promise<TestResult> {
  const { data, error } = await apiFetch.POST('/v1/notifications/test/system', {
    body: { target },
  })
  if (error) throw error
  return data
}
