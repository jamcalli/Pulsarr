import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const projectRoot = resolve(__dirname, '..', '..')

/**
 * Resolves the Pulsarr data directory based on platform and environment.
 *
 * Priority:
 * 1. process.env.dataDir (explicit override, backwards compat with installers)
 * 2. Windows: %PROGRAMDATA%\Pulsarr (like Radarr/Sonarr use CommonApplicationData)
 * 3. macOS: ~/.config/Pulsarr
 * 4. Linux/Docker: null (use project-relative paths)
 */
export function resolveDataDir(): string | null {
  if (process.env.dataDir) {
    return process.env.dataDir
  }

  if (process.platform === 'win32') {
    const programData = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE
    if (programData) {
      return resolve(programData, 'Pulsarr')
    }
  }

  if (process.platform === 'darwin') {
    const home = process.env.HOME
    if (home) {
      return resolve(home, '.config', 'Pulsarr')
    }
  }

  return null
}

/**
 * Resolves the database directory path.
 * With a data dir: {dataDir}/db
 * Without (Linux/Docker): {projectRoot}/data/db
 */
export function resolveDbPath(): string {
  const dataDir = resolveDataDir()
  return dataDir ? resolve(dataDir, 'db') : resolve(projectRoot, 'data', 'db')
}

/**
 * Resolves the log directory path.
 * With a data dir: {dataDir}/logs
 * Without (Linux/Docker): {projectRoot}/data/logs
 */
export function resolveLogPath(): string {
  const dataDir = resolveDataDir()
  return dataDir
    ? resolve(dataDir, 'logs')
    : resolve(projectRoot, 'data', 'logs')
}

/**
 * Resolves the .env file path.
 * With a data dir: {dataDir}/.env
 * Without (Linux/Docker): {projectRoot}/.env
 */
export function resolveEnvPath(): string {
  const dataDir = resolveDataDir()
  return dataDir ? resolve(dataDir, '.env') : resolve(projectRoot, '.env')
}
