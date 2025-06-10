import { useCallback, useRef, useEffect } from 'react'

/**
 * Custom hook that provides a debounced version of a callback function.
 * 
 * @param callback - The function to debounce
 * @param delay - The delay in milliseconds to wait before calling the callback
 * @returns A debounced version of the callback function
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