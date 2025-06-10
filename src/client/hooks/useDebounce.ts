import { useCallback, useRef } from 'react'

/**
 * Custom hook that provides a debounced version of a callback function.
 * 
 * @param callback - The function to debounce
 * @param delay - The delay in milliseconds to wait before calling the callback
 * @returns A debounced version of the callback function
 */
export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, delay)
    },
    [callback, delay]
  ) as T

  return debouncedCallback
}