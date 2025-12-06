import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
)

/** Application version from package.json */
export const APP_VERSION: string = packageJson.version

/**
 * Standard User-Agent header for external API requests
 * Format: "Pulsarr/0.7.5 (+https://github.com/jamcalli/Pulsarr)"
 */
export const USER_AGENT = `Pulsarr/${APP_VERSION} (+https://github.com/jamcalli/Pulsarr)`
