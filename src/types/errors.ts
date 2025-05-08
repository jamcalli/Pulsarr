/**
 * Custom error classes for application-specific errors
 */

/**
 * Error thrown when an operation would leave the system without a default instance
 * when at least one default instance is required.
 */
export class DefaultInstanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DefaultInstanceError'

    // This is needed for correct instanceof checks in TypeScript
    Object.setPrototypeOf(this, DefaultInstanceError.prototype)
  }
}
