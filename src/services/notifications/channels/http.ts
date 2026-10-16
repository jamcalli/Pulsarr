import type { DeliveryResult } from '@root/types/notification.types.js'
import { errorMessage } from '@utils/error-message.js'

export interface PostJsonOptions {
  timeoutMs: number
  headers?: Record<string, string>
  /** Retries timeouts, network errors, 5xx and 429 for three attempts in total. */
  retry?: boolean
  failureReason?: (response: Response) => Promise<string> | string
}

/** `status` is set whenever a response came back. */
export type PostJsonResult = DeliveryResult & { status?: number }

interface Attempt {
  result: PostJsonResult
  transient: boolean
  retryAfterMs?: number
}

const RETRY_BACKOFF_MS = [2_000, 10_000] as const

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number.parseFloat(response.headers.get('Retry-After') ?? '')
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined
}

function statusReason(response: Response): string {
  return `${response.status} ${response.statusText}`
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postOnce(
  url: string,
  body: object,
  options: PostJsonOptions,
): Promise<Attempt> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    if (response.ok) {
      return { result: { ok: true, status: response.status }, transient: false }
    }
    const reason = await (options.failureReason ?? statusReason)(response)
    const rateLimited = response.status === 429
    return {
      result: { ok: false, reason, status: response.status },
      transient: rateLimited || response.status >= 500,
      retryAfterMs: rateLimited ? retryAfterMs(response) : undefined,
    }
  } catch (error) {
    return {
      result: { ok: false, reason: errorMessage(error) },
      transient: true,
    }
  }
}

/** Never throws. Resolves the final attempt's result. */
export async function postJson(
  url: string,
  body: object,
  options: PostJsonOptions,
): Promise<PostJsonResult> {
  let attempt = await postOnce(url, body, options)
  for (const backoffMs of options.retry ? RETRY_BACKOFF_MS : []) {
    if (!attempt.transient) break
    await wait(attempt.retryAfterMs ?? backoffMs)
    attempt = await postOnce(url, body, options)
  }
  return attempt.result
}
