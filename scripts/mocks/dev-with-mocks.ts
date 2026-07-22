/**
 * Start Radarr + Sonarr mocks, then run Pulsarr in --dev mode.
 * Tears down mock child process on exit.
 *
 * Usage: bun run scripts/mocks/dev-with-mocks.ts
 */

import { MOCK_API_KEY } from './fixtures.js'

const RADARR_PORT = Number(process.env.mockRadarrPort ?? 7878)
const SONARR_PORT = Number(process.env.mockSonarrPort ?? 8989)
const READY_TIMEOUT_MS = 10_000
const READY_POLL_MS = 50

async function waitForMockReady(name: string, port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/v3/system/status`
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        headers: { 'X-Api-Key': MOCK_API_KEY },
      })
      if (response.ok) {
        return
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await Bun.sleep(READY_POLL_MS)
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(
    `[dev:mocks] timed out after ${READY_TIMEOUT_MS}ms waiting for ${name} mock at ${url} (${detail})`,
  )
}

const mockProc = Bun.spawn(['bun', 'run', 'scripts/mocks/run-arr-mocks.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
})

let mocksReady = false

try {
  await Promise.race([
    Promise.all([
      waitForMockReady('Radarr', RADARR_PORT),
      waitForMockReady('Sonarr', SONARR_PORT),
    ]).then(() => {
      mocksReady = true
    }),
    // Only reject while the mocks are still coming up; the mocksReady guard keeps
    // this from becoming an unhandled rejection when the mock process exits on shutdown.
    mockProc.exited.then((code) => {
      if (!mocksReady) {
        throw new Error(
          `[dev:mocks] mock process exited before becoming ready (code ${code})`,
        )
      }
    }),
  ])
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  try {
    mockProc.kill()
  } catch {
    // ignore
  }
  await mockProc.exited
  process.exit(1)
}

const devProc = Bun.spawn(['bun', 'run', '--bun', 'src/server.ts', '--dev'], {
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
  env: process.env,
})

let shuttingDown = false

async function shutdown(signal?: string) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  if (signal) {
    console.log(`\n[dev:mocks] received ${signal}, shutting down...`)
  }

  try {
    devProc.kill()
  } catch {
    // ignore
  }
  try {
    mockProc.kill()
  } catch {
    // ignore
  }

  await Promise.allSettled([devProc.exited, mockProc.exited])
  process.exit(devProc.exitCode ?? 0)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

const exitCode = await Promise.race([
  devProc.exited.then((code) => ({ source: 'dev' as const, code })),
  mockProc.exited.then((code) => ({ source: 'mocks' as const, code })),
])

if (exitCode.source === 'mocks' && !shuttingDown) {
  console.error(
    `[dev:mocks] mock process exited unexpectedly (code ${exitCode.code})`,
  )
  await shutdown()
} else if (exitCode.source === 'dev') {
  await shutdown()
}
