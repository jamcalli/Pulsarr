import { posix, win32 } from 'node:path'

/**
 * Normalize a file path for consistent, cross-platform comparison.
 *
 * Converts backslashes to forward slashes, applies platform-specific normalization,
 * and on Windows lowercases the result (since Windows paths are case-insensitive).
 *
 * If `path` is falsy the function returns an empty string.
 *
 * @param path - The input file path to normalize.
 * @returns The normalized path using forward-slash separators; Windows output is lowercased.
 */
export function normalizePath(path: string): string {
  if (!path) return ''

  // Always replace backslashes with forward slashes first
  const forwardSlashPath = path.replace(/\\/g, '/')

  const isWindows = process.platform === 'win32'

  if (isWindows) {
    // Windows: use win32 normalize and lowercase for case-insensitive comparison
    const normalized = win32.normalize(forwardSlashPath)
    return normalized.replace(/\\/g, '/').toLowerCase()
  } else {
    // Unix/POSIX: use posix normalize only
    return posix.normalize(forwardSlashPath)
  }
}

/**
 * Return the last segment (file or directory name) from a path, handling both POSIX and Windows separators.
 *
 * Converts backslashes to forward slashes before extracting the basename using POSIX rules. Returns an empty
 * string if the input is falsy.
 *
 * @param path - The input file system path
 * @returns The final path segment (basename), or an empty string if `path` is falsy
 */
export function getPathBasename(path: string): string {
  if (!path) return ''
  const forwardSlashPath = path.replace(/\\/g, '/')
  return posix.basename(forwardSlashPath)
}
