import { existsSync } from 'node:fs'
import { open, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Knex } from 'knex'

// Path resolution following established pattern
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '../..')

// Gzip magic bytes: 0x1f 0x8b (identification) + 0x08 (deflate compression method)
const GZIP_MAGIC = [0x1f, 0x8b, 0x08]

/**
 * Checks if a file is gzip-compressed by reading just the first 3 bytes.
 * More efficient than reading entire file into memory.
 *
 * Gzip format (RFC 1952):
 * - Byte 0: 0x1f (magic)
 * - Byte 1: 0x8b (magic)
 * - Byte 2: 0x08 (compression method = deflate)
 */
async function isGzipCompressed(filePath: string): Promise<boolean> {
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined
  try {
    fileHandle = await open(filePath, 'r')
    const buffer = Buffer.alloc(3)
    const { bytesRead } = await fileHandle.read(buffer, 0, 3, 0)
    return (
      bytesRead >= 3 &&
      buffer[0] === GZIP_MAGIC[0] &&
      buffer[1] === GZIP_MAGIC[1] &&
      buffer[2] === GZIP_MAGIC[2]
    )
  } finally {
    await fileHandle?.close()
  }
}

/**
 * Updates the history file with new .gz extensions.
 * Handles the Docker path format (/app/data/logs/...) used in production.
 *
 * History file format: one absolute path per line
 * Example:
 *   /app/data/logs/pulsarr-2025-06-25-1.log
 *   /app/data/logs/pulsarr-2025-07-22-1.log
 */
async function updateHistoryFile(historyPath: string): Promise<boolean> {
  const content = await readFile(historyPath, 'utf8')

  // Process line by line for safety
  const updatedLines = content.split('\n').map((line) => {
    const trimmed = line.trim()
    // Only update pulsarr log files that don't already have .gz
    if (
      trimmed.match(/pulsarr-\d{4}-\d{2}-\d{2}.*\.log$/) &&
      !trimmed.endsWith('.gz')
    ) {
      return `${trimmed}.gz`
    }
    return line // Preserve original line (including empty lines, whitespace)
  })

  const updatedContent = updatedLines.join('\n')

  if (updatedContent !== content) {
    await writeFile(historyPath, updatedContent, 'utf8')
    return true
  }
  return false
}

/**
 * Reverts the history file by removing .gz extensions.
 */
async function revertHistoryFile(historyPath: string): Promise<boolean> {
  const content = await readFile(historyPath, 'utf8')

  const revertedLines = content.split('\n').map((line) => {
    const trimmed = line.trim()
    if (trimmed.match(/pulsarr-\d{4}-\d{2}-\d{2}.*\.log\.gz$/)) {
      return trimmed.replace(/\.gz$/, '')
    }
    return line
  })

  const revertedContent = revertedLines.join('\n')

  if (revertedContent !== content) {
    await writeFile(historyPath, revertedContent, 'utf8')
    return true
  }
  return false
}

/**
 * Migrates rotated log files from .log to .log.gz extension.
 *
 * Background: Rotated log files were gzip-compressed but named with .log extension
 * due to custom filename generator in rotating-file-stream not appending .gz.
 * This migration:
 *
 * 1. Renames existing pulsarr-YYYY-MM-DD*.log files to .log.gz (if gzip-compressed)
 * 2. Updates history file (pulsarr-current.log.txt) to track new filenames
 * 3. Enables proper log rotation pruning (maxFiles respects all files)
 *
 * Benefits:
 * - Correct file extensions for compressed files
 * - Standard tools (zcat, zless, zgrep) work automatically
 * - Proper log rotation pruning with maxFiles
 *
 * @see fixes/log-rotation-missing-gz-extension.md
 */
export async function up(_knex: Knex): Promise<void> {
  const logDir = resolve(projectRoot, 'data', 'logs')

  // Exit early if logs directory doesn't exist (fresh install)
  if (!existsSync(logDir)) {
    console.log('[Log Migration] No logs directory found, skipping')
    return
  }

  console.log('[Log Migration] Checking for rotated log files to migrate...')

  const migratedFiles: string[] = []
  const skippedFiles: string[] = []

  try {
    const files = await readdir(logDir)

    // Filter to only rotated pulsarr log files (not current, not already .gz)
    const rotatedLogFiles = files.filter(
      (file) =>
        file.match(/^pulsarr-\d{4}-\d{2}-\d{2}(-\d+)?\.log$/) &&
        !file.includes('.gz'),
    )

    if (rotatedLogFiles.length === 0) {
      console.log('[Log Migration] No rotated .log files found')
    }

    for (const file of rotatedLogFiles) {
      const filePath = resolve(logDir, file)

      try {
        if (await isGzipCompressed(filePath)) {
          const newPath = `${filePath}.gz`
          await rename(filePath, newPath)
          migratedFiles.push(file)
          console.log(`[Log Migration] Renamed: ${file} -> ${file}.gz`)
        } else {
          // File exists but isn't gzip - leave it alone
          skippedFiles.push(file)
          console.log(`[Log Migration] Skipped (not gzip): ${file}`)
        }
      } catch (err) {
        console.warn(
          `[Log Migration] Error processing ${file}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    // Update history file if it exists
    const historyFile = resolve(logDir, 'pulsarr-current.log.txt')
    if (existsSync(historyFile)) {
      try {
        const updated = await updateHistoryFile(historyFile)
        if (updated) {
          console.log(
            '[Log Migration] Updated history file with .gz extensions',
          )
        } else {
          console.log('[Log Migration] History file already up to date')
        }
      } catch (histErr) {
        // History file update is important but not critical - rotation will rebuild it
        console.warn(
          '[Log Migration] Could not update history file:',
          histErr instanceof Error ? histErr.message : histErr,
        )
      }
    }

    // Summary
    console.log(
      `[Log Migration] Complete: ${migratedFiles.length} renamed, ${skippedFiles.length} skipped`,
    )
  } catch (error) {
    // Log error but don't fail migration - file operations are supplementary
    console.warn(
      '[Log Migration] Migration encountered errors but will continue:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Reverts log file extension migration by renaming .log.gz files back to .log.
 *
 * @remark This rollback is primarily for testing. In production, leaving files
 * as .log.gz is harmless and correct. The down migration only reverts filenames,
 * it does NOT revert the logger.ts code change.
 */
export async function down(_knex: Knex): Promise<void> {
  const logDir = resolve(projectRoot, 'data', 'logs')

  if (!existsSync(logDir)) {
    console.log('[Log Migration] No logs directory found, nothing to revert')
    return
  }

  console.log('[Log Migration] Reverting log file extensions...')

  const revertedFiles: string[] = []

  try {
    const files = await readdir(logDir)

    const gzLogFiles = files.filter((file) =>
      file.match(/^pulsarr-\d{4}-\d{2}-\d{2}(-\d+)?\.log\.gz$/),
    )

    for (const file of gzLogFiles) {
      const filePath = resolve(logDir, file)
      const newPath = filePath.replace(/\.gz$/, '')

      try {
        // Idempotency: skip if target .log file already exists
        if (existsSync(newPath)) {
          console.log(
            `[Log Migration] Skipped: ${basename(newPath)} already exists`,
          )
          continue
        }

        await rename(filePath, newPath)
        revertedFiles.push(file)
        console.log(`[Log Migration] Reverted: ${file} -> ${basename(newPath)}`)
      } catch (err) {
        console.warn(
          `[Log Migration] Error reverting ${file}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    // Revert history file
    const historyFile = resolve(logDir, 'pulsarr-current.log.txt')
    if (existsSync(historyFile)) {
      try {
        const reverted = await revertHistoryFile(historyFile)
        if (reverted) {
          console.log('[Log Migration] Reverted history file')
        }
      } catch (histErr) {
        console.warn(
          '[Log Migration] Could not revert history file:',
          histErr instanceof Error ? histErr.message : histErr,
        )
      }
    }

    console.log(
      `[Log Migration] Rollback complete: ${revertedFiles.length} files reverted`,
    )
  } catch (error) {
    console.warn(
      '[Log Migration] Rollback encountered errors:',
      error instanceof Error ? error.message : String(error),
    )
  }
}
