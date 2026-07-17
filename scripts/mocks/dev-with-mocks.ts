/**
 * Start Radarr + Sonarr mocks, then run Pulsarr in --dev mode.
 * Tears down mock child process on exit.
 *
 * Usage: bun run scripts/mocks/dev-with-mocks.ts
 */

const mockProc = Bun.spawn(['bun', 'run', 'scripts/mocks/run-arr-mocks.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
})

// Give mocks a moment to bind ports before Pulsarr starts health checks
await Bun.sleep(400)

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
