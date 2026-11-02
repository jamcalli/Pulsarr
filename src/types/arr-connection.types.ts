import type { ArrConnectionFailureCode } from '@root/schemas/common/arr-test-connection.schema.js'

export type ConnectionTestResult =
  | { success: true; code: null; message: string }
  | { success: false; code: ArrConnectionFailureCode; message: string }

// Type aliases, not interfaces, so they stay assignable to the loose arr resource response schemas
export type ArrQualityProfile = {
  id: number
  name: string
}

export type ArrRootFolder = {
  id: number
  path: string
}

export type ArrTag = {
  id: number
  label: string
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  sortKey: string
  sortDirection: string
  totalRecords: number
  records: T[]
}

/** Validation failure item from an arr API error body, camelCased by System.Text.Json. */
export interface ArrValidationFailure {
  propertyName?: string
  errorMessage?: string
  severity?: string
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public readonly failures: ArrValidationFailure[] = [],
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Thrown when the arr rejects the Pulsarr webhook because its test call to Pulsarr failed. */
export class WebhookCallbackError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WebhookCallbackError'
  }
}
