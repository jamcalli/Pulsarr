import { useCallback, useRef, useEffect } from 'react'

/**
 * Returns a debounced version of the provided callback function that delays its execution until after the specified delay has elapsed since the last call.
 *
 * @param callback - The function to debounce.
 * @param delay - The debounce delay in milliseconds.
 * @returns A function that, when invoked, postpones calling {@link callback} until after {@link delay} milliseconds have passed since the last invocation.
 *
 * @remark The debounced function does not return the result of {@link callback}; it always returns void.
 */
export function useDebounce<TArgs extends readonly unknown[], TReturn = void>(
  callback: (...args: TArgs) => TReturn,
  delay: number
): (...args: TArgs) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedCallback = useCallback(
    (...args: TArgs) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, delay)
    },
    [callback, delay]
  )

  // Clear any pending timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return debouncedCallback
}