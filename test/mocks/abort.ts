import { vi } from 'vitest'

/**
 * Creates a mock AbortSignal for testing abort/timeout behavior
 *
 * @param aborted - Whether the signal should start in aborted state
 * @param reason - Optional abort reason
 * @returns A mock AbortSignal
 *
 * @example
 * const signal = createMockAbortSignal(false)
 */
export function createMockAbortSignal(
  aborted = false,
  reason?: Error,
): AbortSignal {
  const listeners = new Set<(event: Event) => void>()

  const signal = {
    aborted,
    reason: reason || (aborted ? new Error('Aborted') : undefined),
    throwIfAborted: vi.fn(() => {
      if (aborted) {
        throw reason || new Error('Aborted')
      }
    }),
    addEventListener: vi.fn(
      (type: string, listener: (event: Event) => void) => {
        if (type === 'abort') {
          listeners.add(listener)
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: (event: Event) => void) => {
        if (type === 'abort') {
          listeners.delete(listener)
        }
      },
    ),
    dispatchEvent: vi.fn(() => true),
    onabort: null,
    // Internal method for testing - trigger abort
    _triggerAbort: (abortReason?: Error) => {
      signal.aborted = true
      signal.reason = abortReason || new Error('Aborted')
      const event = new Event('abort')
      for (const listener of listeners) {
        listener(event)
      }
      if (signal.onabort) {
        signal.onabort(event)
      }
    },
  } as AbortSignal & { _triggerAbort: (reason?: Error) => void }

  return signal
}

/**
 * Creates a mock AbortController with a controllable signal
 *
 * @returns A mock AbortController with helper methods
 *
 * @example
 * const controller = createMockAbortController()
 * // Later trigger abort
 * controller.abort()
 */
export function createMockAbortController(): AbortController {
  const signal = createMockAbortSignal(false)

  const controller = {
    signal,
    abort: vi.fn((reason?: Error) => {
      ;(signal as ReturnType<typeof createMockAbortSignal>)._triggerAbort(
        reason,
      )
    }),
  } as unknown as AbortController

  return controller
}

/**
 * Creates a mock AbortSignal that will abort after a delay
 *
 * @param timeoutMs - Time in milliseconds before abort
 * @returns Object with signal and a cleanup function
 *
 * @example
 * const { signal, cleanup } = createTimeoutSignal(1000)
 * // Signal will abort after 1 second
 * // Call cleanup() to cancel the timeout
 */
export function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal
  cleanup: () => void
} {
  const signal = createMockAbortSignal(false)
  const timeoutId = setTimeout(() => {
    ;(signal as ReturnType<typeof createMockAbortSignal>)._triggerAbort(
      new Error('Timeout'),
    )
  }, timeoutMs)

  return {
    signal,
    cleanup: () => clearTimeout(timeoutId),
  }
}

/**
 * Helper to test if a function properly handles abort signals
 *
 * @param fn - Async function that accepts an AbortSignal
 * @param abortAfterMs - Time to wait before aborting
 * @returns Promise that resolves with error if abort was handled
 *
 * @example
 * await testAbortHandling(async (signal) => {
 *   await fetch('url', { signal })
 * }, 100)
 */
export async function testAbortHandling(
  fn: (signal: AbortSignal) => Promise<void>,
  abortAfterMs: number,
): Promise<Error | null> {
  const { signal, cleanup } = createTimeoutSignal(abortAfterMs)

  try {
    await fn(signal)
    cleanup()
    return null // Function completed without abort
  } catch (error) {
    cleanup()
    return error as Error
  }
}

/**
 * Creates a mock AbortSignal.timeout for testing timeout behavior
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns A mock AbortSignal that will abort after timeout
 *
 * @example
 * const signal = mockAbortTimeout(5000)
 */
export function mockAbortTimeout(timeoutMs: number): AbortSignal {
  const { signal } = createTimeoutSignal(timeoutMs)
  return signal
}

/**
 * Creates a mock AbortSignal.any for combining multiple signals
 *
 * @param signals - Array of AbortSignals to combine
 * @returns A signal that aborts when any of the input signals abort
 *
 * @example
 * const combined = mockAbortAny([signal1, signal2])
 */
export function mockAbortAny(signals: AbortSignal[]): AbortSignal {
  const combinedSignal = createMockAbortSignal(false)

  // Abort combined signal if any input signal is already aborted
  const alreadyAborted = signals.find((s) => s.aborted)
  if (alreadyAborted) {
    ;(combinedSignal as ReturnType<typeof createMockAbortSignal>)._triggerAbort(
      alreadyAborted.reason instanceof Error
        ? alreadyAborted.reason
        : new Error('Aborted'),
    )
    return combinedSignal
  }

  // Listen to all signals and abort when any aborts
  signals.forEach((signal) => {
    signal.addEventListener('abort', () => {
      if (!combinedSignal.aborted) {
        ;(
          combinedSignal as ReturnType<typeof createMockAbortSignal>
        )._triggerAbort(
          signal.reason instanceof Error ? signal.reason : new Error('Aborted'),
        )
      }
    })
  })

  return combinedSignal
}

/**
 * Helper to wait for an abort signal to be triggered
 *
 * @param signal - AbortSignal to wait for
 * @param timeoutMs - Maximum time to wait (default: 1000ms)
 * @returns Promise that resolves when signal aborts or rejects on timeout
 *
 * @example
 * await waitForAbort(signal, 500)
 */
export async function waitForAbort(
  signal: AbortSignal,
  timeoutMs = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for abort signal'))
    }, timeoutMs)

    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}
