import { posix, win32 } from 'node:path'

/**
 * Normalizes file paths for cross-platform compatibility and comparison.
 *
 * - Converts backslashes to forward slashes
 * - Applies platform-appropriate normalization
 * - Applies case normalization for case-insensitive systems (Windows)
 *
 * @param path - The file path to normalize
 * @returns Normalized path suitable for cross-platform comparison
 */
export function normalizePath(path: string): string {
  if (!path) return path

  // Always replace backslashes with forward slashes first
  const forwardSlashPath = path.replace(/\\/g, '/')

  const isWindows = process.platform === 'win32'

  if (isWindows) {
    // Windows: use win32 normalize and lowercase for case-insensitive comparison
    return win32.normalize(forwardSlashPath).toLowerCase()
  } else {
    // Unix/POSIX: use posix normalize only
    return posix.normalize(forwardSlashPath)
  }
}

/**
 * Extracts the last segment (folder/file name) from a cross-platform path.
 *
 * @param path - The file path
 * @returns The last path segment or empty string if none
 */
export function getPathBasename(path: string): string {
  return path.split(/[/\\]/).pop() || ''
}
