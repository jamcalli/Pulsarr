#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Build native distribution packages for Pulsarr
 * Produces per-platform zips with the Bun runtime included - no install needed
 *
 * Usage: bun run --bun scripts/build-native.ts [options]
 *   --run          Build for current platform and start the app
 *   --current      Build only for the current platform
 *   --all          Build for all platforms (default)
 *   --skip-build   Skip tsc/vite build (reuse existing dist/)
 */

import { execFileSync, execSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import packageJson from '../package.json'

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const BUILD_DIR = resolve(PROJECT_ROOT, 'native-build')
const COMMON_DIR = resolve(BUILD_DIR, '_common')

const BUN_VERSION = readFileSync(
  resolve(PROJECT_ROOT, '.bun-version'),
  'utf8',
).trim()
if (!BUN_VERSION) {
  throw new Error('Missing or empty .bun-version file')
}
const WINSW_VERSION = '2.12.0'
const WINSW_URL = `https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe`
const VERSION = packageJson.version

interface Platform {
  detectName: string
  bunArchive: string
  bunBinary: string
  zipSuffix: string
}

// Bun uses "aarch64" not "arm64" in release asset names
const PLATFORMS: Platform[] = [
  {
    detectName: 'linux-x64',
    bunArchive: 'bun-linux-x64',
    bunBinary: 'bun',
    zipSuffix: 'linux-x64',
  },
  {
    detectName: 'linux-arm64',
    bunArchive: 'bun-linux-aarch64',
    bunBinary: 'bun',
    zipSuffix: 'linux-arm64',
  },
  {
    detectName: 'darwin-arm64',
    bunArchive: 'bun-darwin-aarch64',
    bunBinary: 'bun',
    zipSuffix: 'macos-arm64',
  },
  {
    detectName: 'darwin-x64',
    bunArchive: 'bun-darwin-x64',
    bunBinary: 'bun',
    zipSuffix: 'macos-x64',
  },
  {
    detectName: 'linux-x64-baseline',
    bunArchive: 'bun-linux-x64-baseline',
    bunBinary: 'bun',
    zipSuffix: 'linux-x64-baseline',
  },
  {
    detectName: 'windows-x64',
    bunArchive: 'bun-windows-x64',
    bunBinary: 'bun.exe',
    zipSuffix: 'windows-x64',
  },
  {
    detectName: 'windows-x64-baseline',
    bunArchive: 'bun-windows-x64-baseline',
    bunBinary: 'bun.exe',
    zipSuffix: 'windows-x64-baseline',
  },
]

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: 'inherit', cwd: cwd ?? PROJECT_ROOT })
}

function runFile(cmd: string, args: string[], cwd?: string) {
  execFileSync(cmd, args, { stdio: 'inherit', cwd: cwd ?? PROJECT_ROOT })
}

function detectPlatform(): string {
  const os =
    process.platform === 'darwin'
      ? 'darwin'
      : process.platform === 'win32'
        ? 'windows'
        : process.platform === 'linux'
          ? 'linux'
          : null
  const arch =
    process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  if (!os || !arch) {
    throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
  }
  if (os === 'linux' && arch === 'x64') {
    try {
      const cpuInfo = readFileSync('/proc/cpuinfo', 'utf8').toLowerCase()
      return cpuInfo.includes('avx2') ? 'linux-x64' : 'linux-x64-baseline'
    } catch {
      return 'linux-x64-baseline'
    }
  }
  return `${os}-${arch}`
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)}M`
}

const args = new Set(process.argv.slice(2))
const runAfter = args.has('--run')
const currentOnly = args.has('--current') || runAfter
const skipBuild = args.has('--skip-build')
const currentPlatform = detectPlatform()

console.log(`=== Pulsarr Native Build v${VERSION} ===`)
console.log(`Bun version: ${BUN_VERSION}`)
console.log(
  currentOnly ? `Target: ${currentPlatform} only` : 'Targets: all platforms',
)
console.log('')

if (existsSync(BUILD_DIR)) {
  rmSync(BUILD_DIR, { recursive: true })
}
mkdirSync(BUILD_DIR, { recursive: true })

if (!skipBuild) {
  console.log('[1/4] Building server...')
  // Wipe dist first: tsc builds incrementally and never deletes stale output.
  run('bun run clean:server')
  run('bun run build:server')

  console.log('[2/4] Building client...')
  run('bunx rimraf dist/client')
  run('bun run --bun vite build')
} else {
  console.log('[1/4] Skipping server build (--skip-build)')
  console.log('[2/4] Skipping client build (--skip-build)')
}

console.log('[3/4] Assembling common files...')
mkdirSync(COMMON_DIR, { recursive: true })

// dist/ - tsc server output + vite client output
const distDir = resolve(PROJECT_ROOT, 'dist')
if (!existsSync(distDir)) {
  throw new Error(
    'dist/ directory not found. Run build first or remove --skip-build flag.',
  )
}
cpSync(distDir, resolve(COMMON_DIR, 'dist'), {
  recursive: true,
})
const nestedBuild = resolve(COMMON_DIR, 'dist', 'native-build')
if (existsSync(nestedBuild)) {
  rmSync(nestedBuild, { recursive: true })
}

// migrations/ - Knex runtime directory scanning + utils (clientDetection.ts)
mkdirSync(resolve(COMMON_DIR, 'migrations'), { recursive: true })
cpSync(
  resolve(PROJECT_ROOT, 'migrations', 'migrations'),
  resolve(COMMON_DIR, 'migrations', 'migrations'),
  { recursive: true },
)
cpSync(
  resolve(PROJECT_ROOT, 'migrations', 'utils'),
  resolve(COMMON_DIR, 'migrations', 'utils'),
  { recursive: true },
)
cpSync(
  resolve(PROJECT_ROOT, 'migrations', 'knexfile.ts'),
  resolve(COMMON_DIR, 'migrations', 'knexfile.ts'),
)
cpSync(
  resolve(PROJECT_ROOT, 'migrations', 'migrate.ts'),
  resolve(COMMON_DIR, 'migrations', 'migrate.ts'),
)

// packages/ - better-sqlite3-bun shim (package.json uses file: reference)
mkdirSync(resolve(COMMON_DIR, 'packages'), { recursive: true })
cpSync(
  resolve(PROJECT_ROOT, 'packages', 'better-sqlite3-bun'),
  resolve(COMMON_DIR, 'packages', 'better-sqlite3-bun'),
  { recursive: true },
)

cpSync(
  resolve(PROJECT_ROOT, '.env.example'),
  resolve(COMMON_DIR, '.env.example'),
)

const tmdbKey = process.env.TMDBAPIKEY
if (tmdbKey) {
  const envExample = resolve(COMMON_DIR, '.env.example')
  let content = readFileSync(envExample, 'utf8')
  content += `\n# --- TMDB (pre-configured) ---\ntmdbApiKey=${tmdbKey}\n`
  writeFileSync(envExample, content)
  console.log('    Injected TMDB API key into .env.example')
}

cpSync(
  resolve(PROJECT_ROOT, 'package.json'),
  resolve(COMMON_DIR, 'package.json'),
)
cpSync(resolve(PROJECT_ROOT, 'bun.lock'), resolve(COMMON_DIR, 'bun.lock'))

console.log('    Installing production dependencies...')
try {
  run('bun install --production --frozen-lockfile', COMMON_DIR)
} catch (e) {
  console.log(
    '    Frozen lockfile failed, retrying without:',
    e instanceof Error ? e.message : e,
  )
  run('bun install --production', COMMON_DIR)
}

// Remove build tools that leak through optional peer dep resolution
const buildToolDirs = [
  'vite',
  'rollup',
  'esbuild',
  '@rollup',
  '@esbuild',
  'rolldown',
  '@rolldown',
]
for (const dir of buildToolDirs) {
  const dirPath = resolve(COMMON_DIR, 'node_modules', dir)
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true })
  }
}

console.log('[4/4] Packaging platforms...')

const UNIX_START = `#!/bin/bash
set -euo pipefail
cd "$(dirname "\${BASH_SOURCE[0]}")"

echo "Running database migrations..."
./bun run --bun migrations/migrate.ts

echo "Starting Pulsarr..."
exec ./bun run --bun dist/server.js "$@"
`

const UPDATE_UNIX = `#!/bin/bash
# Update a portable Pulsarr install from a downloaded release zip.
# Replaces only Pulsarr's own program files; your config and data are left alone.
#
# Usage: ./update.sh <path-to-new-release-zip>
set -euo pipefail

# The cp below overwrites this script mid-run. Bash reads the script from disk as
# it executes, so keep the whole body in a function (parsed up front) and exit on
# the last line before bash can read past it into the replacement.
main() {
  ZIP="\${1:-}"
  if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
    echo "Usage: ./update.sh <path-to-new-release-zip>"
    exit 1
  fi
  # Resolve the zip to an absolute path before cd so a relative arg keeps working.
  ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"

  cd "$(dirname "\${BASH_SOURCE[0]}")"
  INSTALL_DIR="$(pwd)"

  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is required but was not found."
    exit 1
  fi

  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  echo "Extracting update..."
  unzip -q "$ZIP" -d "$TMP"

  # Release zips hold a single top-level pulsarr-vX.Y.Z-<platform>/ directory.
  NEW="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -name 'pulsarr-*' | head -1)" || true
  if [ -z "$NEW" ]; then NEW="$TMP"; fi

  if [ ! -f "$NEW/start.sh" ]; then
    echo "This does not look like a Pulsarr release zip (start.sh not found)."
    exit 1
  fi
  if [ ! -d "$NEW/dist" ] || [ ! -d "$NEW/node_modules" ]; then
    echo "This release zip is incomplete (dist or node_modules missing)."
    exit 1
  fi

  echo "Replacing application files..."
  # Only dist and node_modules are deleted; config and data are left in place.
  rm -rf "$INSTALL_DIR/dist" "$INSTALL_DIR/node_modules"
  cp -a "$NEW/." "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/start.sh" "$INSTALL_DIR/bun" 2>/dev/null || true

  echo "Update complete. Start Pulsarr with ./start.sh (or restart your service)."
}

main "$@"; exit 0
`

const WINDOWS_START = `@echo off
cd /d "%~dp0"

echo Running database migrations...
.\\bun.exe run --bun migrations\\migrate.ts

echo Starting Pulsarr...
.\\bun.exe run --bun dist\\server.js %*

echo.
echo Pulsarr has exited (code: %ERRORLEVEL%)
if not defined PULSARR_SERVICE pause
`

const UPDATE_WINDOWS = `@echo off
setlocal enabledelayedexpansion

if "%~1"=="" (
  echo Usage: update.bat ^<path-to-new-release-zip^>
  exit /b 1
)
if not exist "%~1" (
  echo Zip not found: %~1
  exit /b 1
)

rem cmd reads this file from disk as it runs and the update replaces this folder,
rem so relaunch a copy from TEMP before touching anything here.
if not defined PULSARR_UPDATE_STAGED (
  set "STAGED=%TEMP%\\pulsarr-update-%RANDOM%%RANDOM%.bat"
  copy /y "%~f0" "!STAGED!" >nul
  set "PULSARR_UPDATE_STAGED=1"
  call "!STAGED!" "%~dp0." "%~f1"
  set "RC=!ERRORLEVEL!"
  del "!STAGED!" >nul 2>&1
  exit /b !RC!
)

set "INSTALL=%~1"
if "!INSTALL:~-2!"=="\\." set "INSTALL=!INSTALL:~0,-2!"
if "!INSTALL:~-1!"=="\\" set "INSTALL=!INSTALL:~0,-1!"
set "ZIP=%~2"
set "STAGEDIR=%TEMP%\\pulsarr-new-%RANDOM%%RANDOM%"

echo Extracting update...
rem Pass paths to PowerShell via environment variables so quotes or apostrophes
rem in the path cannot break out of the command string.
set "PS_ZIP=%ZIP%"
set "PS_DEST=%STAGEDIR%"
powershell -NoProfile -Command "Expand-Archive -LiteralPath $env:PS_ZIP -DestinationPath $env:PS_DEST -Force"
if errorlevel 1 (
  echo Failed to extract zip.
  rd /s /q "%STAGEDIR%" 2>nul
  exit /b 1
)

set "NEW="
for /d %%D in ("%STAGEDIR%\\pulsarr-*") do set "NEW=%%D"
if not defined NEW set "NEW=%STAGEDIR%"

if not exist "!NEW!\\start.bat" (
  echo This does not look like a Pulsarr release zip.
  rd /s /q "%STAGEDIR%" 2>nul
  exit /b 1
)
if not exist "!NEW!\\dist" (
  echo This release zip is incomplete (dist missing).
  rd /s /q "%STAGEDIR%" 2>nul
  exit /b 1
)
if not exist "!NEW!\\node_modules" (
  echo This release zip is incomplete (node_modules missing).
  rd /s /q "%STAGEDIR%" 2>nul
  exit /b 1
)

if exist "!INSTALL!\\pulsarr-service.exe" (
  echo Stopping Pulsarr service...
  "!INSTALL!\\pulsarr-service.exe" stop >nul 2>&1
  timeout /t 2 /nobreak >nul
)

echo Replacing application files...
rem Only dist and node_modules are removed; /E copies without purging the rest.
rd /s /q "!INSTALL!\\dist" 2>nul
rd /s /q "!INSTALL!\\node_modules" 2>nul
robocopy "!NEW!" "!INSTALL!" /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP >nul
set "RC=!ERRORLEVEL!"
rd /s /q "%STAGEDIR%" 2>nul

if !RC! GEQ 8 (
  echo Update failed ^(robocopy code !RC!^). Make sure Pulsarr is fully stopped and retry.
  exit /b 1
)

echo Update complete.
echo Start Pulsarr with start.bat, or: pulsarr-service.exe start
exit /b 0
`

const WINSW_XML = `<service>
  <id>pulsarr</id>
  <name>Pulsarr</name>
  <description>Plex watchlist tracker and notification center</description>
  <executable>%BASE%\\start.bat</executable>
  <startmode>Automatic</startmode>
  <logpath>%BASE%\\data\\logs</logpath>
  <log mode="none"/>
  <stopparentprocessfirst>true</stopparentprocessfirst>
  <env name="PULSARR_SERVICE" value="1"/>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
</service>
`

const INSTALL_SERVICE_BAT = `@echo off
cd /d "%~dp0"

sc query pulsarr >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Existing Pulsarr service detected, updating...
    echo Stopping service...
    pulsarr-service.exe stop
    echo Removing old service registration...
    pulsarr-service.exe uninstall
    timeout /t 2 /nobreak >nul
)

echo Installing Pulsarr as a Windows service...
pulsarr-service.exe install
echo Starting Pulsarr service...
pulsarr-service.exe start
echo.
echo Pulsarr is now running as a Windows service.
echo Manage it via services.msc or:
echo   pulsarr-service.exe stop
echo   pulsarr-service.exe start
echo   pulsarr-service.exe restart
pause
`

const UNINSTALL_SERVICE_BAT = `@echo off
cd /d "%~dp0"
echo Stopping Pulsarr service...
pulsarr-service.exe stop
echo Uninstalling Pulsarr service...
pulsarr-service.exe uninstall
echo.
echo Pulsarr service has been removed.
pause
`

const README_LINUX = `# Pulsarr - Native Install (Linux)

## Quick Start

1. Copy .env.example to .env and edit your settings:
   cp .env.example .env

2. Run Pulsarr:
   ./start.sh

3. Open http://localhost:3003 in your browser.

To stop, press Ctrl+C in the terminal.

## Run as a systemd Service

Create /etc/systemd/system/pulsarr.service:

  [Unit]
  Description=Pulsarr
  After=network.target

  [Service]
  Type=exec
  WorkingDirectory=/opt/pulsarr
  ExecStart=/opt/pulsarr/start.sh
  Restart=on-failure
  RestartSec=10

  [Install]
  WantedBy=multi-user.target

Then enable and start:
  sudo systemctl daemon-reload
  sudo systemctl enable --now pulsarr

Manage with:
  sudo systemctl stop pulsarr
  sudo systemctl restart pulsarr
  sudo journalctl -u pulsarr -f

## Updating

1. Stop Pulsarr (Ctrl+C, or stop the service):
   sudo systemctl stop pulsarr

2. Download the new release zip, then run the updater with its path:
   ./update.sh ~/Downloads/pulsarr-vX.Y.Z-linux-x64.zip
   Pulsarr's program files are replaced; your config and data are left untouched
   wherever .env points them.
   (If you installed with the install script, re-running it updates in place too.)

3. Start Pulsarr:
   ./start.sh
   (or: sudo systemctl start pulsarr)

Migrations run automatically on startup.

## Data & Configuration

- Configuration: .env (copied from .env.example)
- Database and logs: ./data/
`

const README_MACOS = `# Pulsarr - Native Install (macOS)

## Quick Start

1. Run Pulsarr (this creates ~/.config/Pulsarr on first start):
   ./start.sh

   If macOS blocks execution, allow it in System Settings > Privacy & Security,
   or remove the quarantine attribute:
   xattr -r -d com.apple.quarantine .

2. Optional: to configure via .env, copy .env.example to ~/.config/Pulsarr/.env
   and edit it, then restart. Pulsarr reads config from there, not this folder.

3. Open http://localhost:3003 in your browser.

To stop, press Ctrl+C in the terminal.

## Run as a launchd Service

Create ~/Library/LaunchAgents/com.pulsarr.plist:

  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.pulsarr</string>
    <key>WorkingDirectory</key>
    <string>/Users/YOU/pulsarr</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Users/YOU/pulsarr/start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOU/pulsarr/data/logs/pulsarr.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOU/pulsarr/data/logs/pulsarr.log</string>
  </dict>
  </plist>

Replace /Users/YOU/pulsarr with your actual install path, then load:
  launchctl load ~/Library/LaunchAgents/com.pulsarr.plist

Manage with:
  launchctl stop com.pulsarr
  launchctl start com.pulsarr
  launchctl unload ~/Library/LaunchAgents/com.pulsarr.plist

## Updating

1. Stop Pulsarr (Ctrl+C, or stop the service):
   launchctl stop com.pulsarr

2. Download the new release zip, then run the updater with its path:
   ./update.sh ~/Downloads/pulsarr-vX.Y.Z-macos-arm64.zip
   Pulsarr's program files are replaced; your config and data are left untouched
   wherever .env points them.
   (If you installed the .app via the DMG, just reinstall the new DMG instead.)

3. Start Pulsarr:
   ./start.sh
   (or: launchctl start com.pulsarr)

Migrations run automatically on startup.

## Data & Configuration

- Configuration and data live in ~/.config/Pulsarr (.env, db, and logs)
`

const README_WINDOWS = `# Pulsarr - Native Install (Windows)

## Quick Start

1. Double-click start.bat or run it from a terminal (this creates
   %PROGRAMDATA%\\Pulsarr on first start):
   start.bat

2. Optional: to configure via .env, copy .env.example to
   %PROGRAMDATA%\\Pulsarr\\.env and edit it, then restart. Pulsarr reads config
   from there, not this folder.

3. Open http://localhost:3003 in your browser.

To stop, press Ctrl+C in the terminal or close the window.

## Run as a Windows Service

Install the service (runs on boot):
  install-service.bat    (run as Administrator)

Manage with:
  pulsarr-service.exe stop
  pulsarr-service.exe start
  pulsarr-service.exe restart

Or use services.msc to manage the "Pulsarr" service.

Remove the service:
  uninstall-service.bat  (run as Administrator)

## Updating

1. Stop Pulsarr (Ctrl+C, close the window, or stop the service):
   pulsarr-service.exe stop

2. Download the new release zip, then run the updater with its path:
   update.bat C:\\Users\\You\\Downloads\\pulsarr-vX.Y.Z-windows-x64.zip
   Pulsarr's program files are replaced; your config and data are left untouched
   wherever .env points them.
   (If you installed with the Windows installer, just run the new installer instead.)

3. Start Pulsarr:
   start.bat
   (or: pulsarr-service.exe start)

Migrations run automatically on startup.

## Data & Configuration

- Configuration and data live in %PROGRAMDATA%\\Pulsarr (.env, db, and logs)
`

function getReadme(zipSuffix: string): string {
  if (zipSuffix.includes('windows')) return README_WINDOWS
  if (zipSuffix.includes('macos')) return README_MACOS
  return README_LINUX
}

for (const platform of PLATFORMS) {
  if (currentOnly && platform.detectName !== currentPlatform) {
    continue
  }

  const zipName = `pulsarr-v${VERSION}-${platform.zipSuffix}`
  const platformDir = resolve(BUILD_DIR, zipName)
  const isWindows = platform.zipSuffix.includes('windows')

  console.log(`    ${platform.zipSuffix}...`)

  cpSync(COMMON_DIR, platformDir, { recursive: true })

  const bunUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${platform.bunArchive}.zip`
  const bunTmp = resolve(BUILD_DIR, `_bun_${platform.detectName}.zip`)
  const checksumUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/SHASUMS256.txt`
  const checksumFile = resolve(BUILD_DIR, '_bun_checksums.txt')

  if (!existsSync(bunTmp)) {
    runFile('curl', ['-fsSL', bunUrl, '-o', bunTmp])

    if (!existsSync(checksumFile)) {
      runFile('curl', ['-fsSL', checksumUrl, '-o', checksumFile])
    }
    const checksums = readFileSync(checksumFile, 'utf8')
    const expectedLine = checksums
      .split('\n')
      .find((line) => line.includes(`${platform.bunArchive}.zip`))
    if (!expectedLine) {
      rmSync(bunTmp, { force: true })
      throw new Error(
        `Checksum entry not found for ${platform.bunArchive}.zip in SHASUMS256.txt`,
      )
    }
    const expectedHash = expectedLine.split(/\s+/)[0]
    const fileBuffer = readFileSync(bunTmp)
    const hasher = new Bun.CryptoHasher('sha256')
    hasher.update(fileBuffer)
    const actualHash = hasher.digest('hex')
    if (actualHash !== expectedHash) {
      rmSync(bunTmp, { force: true })
      throw new Error(
        `Checksum mismatch for ${platform.bunArchive}.zip: expected ${expectedHash}, got ${actualHash}`,
      )
    }
    console.log(`      Checksum verified for ${platform.bunArchive}.zip`)
  }

  try {
    runFile('unzip', [
      '-qjo',
      bunTmp,
      `*/${platform.bunBinary}`,
      '-d',
      `${platformDir}/`,
    ])
  } catch (_e1) {
    try {
      runFile('unzip', [
        '-qjo',
        bunTmp,
        platform.bunBinary,
        '-d',
        `${platformDir}/`,
      ])
    } catch (_e2) {
      throw new Error(
        `Failed to extract Bun binary from ${bunTmp}: tried nested and flat patterns`,
      )
    }
  }

  try {
    chmodSync(resolve(platformDir, platform.bunBinary), 0o755)
  } catch {
    // Windows binaries don't need chmod
  }

  if (isWindows) {
    writeFileSync(resolve(platformDir, 'start.bat'), WINDOWS_START)
    writeFileSync(resolve(platformDir, 'update.bat'), UPDATE_WINDOWS)

    const winswTmp = resolve(BUILD_DIR, '_winsw.exe')
    if (!existsSync(winswTmp)) {
      runFile('curl', ['-fsSL', WINSW_URL, '-o', winswTmp])
    }
    cpSync(winswTmp, resolve(platformDir, 'pulsarr-service.exe'))
    writeFileSync(resolve(platformDir, 'pulsarr-service.xml'), WINSW_XML)
    writeFileSync(
      resolve(platformDir, 'install-service.bat'),
      INSTALL_SERVICE_BAT,
    )
    writeFileSync(
      resolve(platformDir, 'uninstall-service.bat'),
      UNINSTALL_SERVICE_BAT,
    )
  } else {
    const startPath = resolve(platformDir, 'start.sh')
    writeFileSync(startPath, UNIX_START)
    chmodSync(startPath, 0o755)

    const updatePath = resolve(platformDir, 'update.sh')
    writeFileSync(updatePath, UPDATE_UNIX)
    chmodSync(updatePath, 0o755)
  }

  writeFileSync(
    resolve(platformDir, 'README.txt'),
    getReadme(platform.zipSuffix),
  )

  runFile('zip', ['-qr', `${zipName}.zip`, zipName], BUILD_DIR)

  const zipSize = statSync(resolve(BUILD_DIR, `${zipName}.zip`)).size
  console.log(`      -> ${zipName}.zip (${formatSize(zipSize)})`)
}

// Cleanup - keep unzipped dirs when --run needs them
rmSync(COMMON_DIR, { recursive: true, force: true })
const currentPlatformConfig = PLATFORMS.find(
  (p) => p.detectName === currentPlatform,
)
const currentZipName = currentPlatformConfig
  ? `pulsarr-v${VERSION}-${currentPlatformConfig.zipSuffix}`
  : null

for (const f of readdirSync(BUILD_DIR)) {
  const fullPath = resolve(BUILD_DIR, f)
  if (
    f.startsWith('_bun_') ||
    f === '_winsw.exe' ||
    f === '_bun_checksums.txt'
  ) {
    rmSync(fullPath, { force: true })
  } else if (!f.endsWith('.zip') && statSync(fullPath).isDirectory()) {
    if (runAfter && f === currentZipName) {
      continue
    }
    rmSync(fullPath, { recursive: true, force: true })
  }
}

console.log('')
console.log('=== Build complete ===')
console.log('')
console.log('Artifacts:')
for (const f of readdirSync(BUILD_DIR)
  .filter((f) => f.endsWith('.zip'))
  .sort()) {
  const size = statSync(resolve(BUILD_DIR, f)).size
  console.log(`  ${f} (${formatSize(size)})`)
}

if (runAfter) {
  const target = PLATFORMS.find((p) => p.detectName === currentPlatform)
  if (target) {
    const dir = resolve(BUILD_DIR, `pulsarr-v${VERSION}-${target.zipSuffix}`)
    console.log('')
    console.log('=== Starting Pulsarr from native build ===')
    if (target.zipSuffix.includes('windows')) {
      run('cmd /c start.bat', dir)
    } else {
      run('./start.sh', dir)
    }
  }
}
