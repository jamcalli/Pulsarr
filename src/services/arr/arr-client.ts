import type { PagedResult } from '@root/types/arr-connection.types.js'
import { arrResponseError } from '@utils/arr-error.js'
import { ensureHttpScheme } from '@utils/url.js'

export const ARR_API_TIMEOUT_MS = 300_000
export const ARR_CONNECTION_TEST_TIMEOUT_MS = 10_000

export interface ArrClientOptions {
  appName: string
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

type ArrMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export class ArrClient {
  readonly baseUrl: string
  private readonly appName: string
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(options: ArrClientOptions) {
    this.appName = options.appName
    this.baseUrl = ensureHttpScheme(options.baseUrl)
    this.apiKey = options.apiKey
    this.timeoutMs = options.timeoutMs
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await this.request('GET', endpoint)
    return response.json() as Promise<T>
  }

  /** Resolves undefined when the arr answers 204 or with a non-JSON body. */
  async post<T>(endpoint: string, payload: object): Promise<T | undefined> {
    return readOptionalJson<T>(await this.request('POST', endpoint, payload))
  }

  /** Resolves undefined when the arr answers 204 or with a non-JSON body. */
  async put<T>(endpoint: string, payload: object): Promise<T | undefined> {
    return readOptionalJson<T>(await this.request('PUT', endpoint, payload))
  }

  async delete(endpoint: string): Promise<void> {
    await this.request('DELETE', endpoint)
  }

  async getAllPages<T>(
    endpoint: string,
    sortKey: string,
    pageSize = 1000,
  ): Promise<T[]> {
    const records: T[] = []
    let totalRecords = 0
    let page = 1
    do {
      const result = await this.get<PagedResult<T>>(
        `${endpoint}?page=${page}&pageSize=${pageSize}&sortDirection=ascending&sortKey=${sortKey}`,
      )
      totalRecords = result.totalRecords
      records.push(...result.records)
      page++
    } while (records.length < totalRecords)
    return records
  }

  private async request(
    method: ArrMethod,
    endpoint: string,
    payload?: object,
  ): Promise<Response> {
    const response = await fetch(this.url(endpoint), {
      method,
      headers: {
        'X-Api-Key': this.apiKey,
        ...(payload !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'DELETE' && { Accept: 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      throw await arrResponseError(
        response,
        method === 'DELETE'
          ? `Resource not found: ${endpoint}`
          : `API endpoint not found: ${endpoint}`,
      )
    }
    return response
  }

  private url(endpoint: string): string {
    try {
      return new URL(`${this.baseUrl}/api/v3/${endpoint}`).toString()
    } catch (error) {
      throw new Error(
        `Invalid base URL format. Please check your ${this.appName} URL configuration.`,
        { cause: error },
      )
    }
  }
}

async function readOptionalJson<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) return undefined
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return undefined
  }
  return response.json() as Promise<T>
}
