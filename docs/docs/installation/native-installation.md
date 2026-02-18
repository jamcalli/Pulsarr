---
sidebar_position: 2
---

# Native Installation

Pulsarr provides native builds for Linux, macOS, and Windows — no Docker or runtime installation required. Each platform has an easy installer method (recommended) and a manual option for advanced users.

## Linux

### One-Line Installer (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/master/scripts/installers/linux/install.sh | sudo bash
```

This script:
- Detects your architecture (x64 or arm64)
- Downloads the latest release from GitHub
- Installs to `/opt/pulsarr/`
- Creates a `pulsarr` system user
- Sets up a systemd service with security hardening
- Starts Pulsarr automatically

**Requirements:** curl, unzip, systemd

:::note Non-systemd Systems
For systems without systemd (Alpine, older distros), use [Docker](./quick-start#docker-installation-recommended) instead.
:::

#### Managing the Service

```bash
# Check status
sudo systemctl status pulsarr

# View logs
sudo journalctl -u pulsarr -f

# Stop/start/restart
sudo systemctl stop pulsarr
sudo systemctl start pulsarr
sudo systemctl restart pulsarr
```

#### Updating

Re-run the install script — it preserves your `.env` and `data/` directory:

```bash
curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/master/scripts/installers/linux/install.sh | sudo bash
```

#### Uninstalling

```bash
# Uninstall but keep data
curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/master/scripts/installers/linux/install.sh | sudo bash -s -- --uninstall

# Uninstall and delete all data
curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/master/scripts/installers/linux/install.sh | sudo bash -s -- --purge
```

#### Data Locations

| Item | Location |
|------|----------|
| Application | `/opt/pulsarr/` |
| Configuration | `/opt/pulsarr/.env` |
| Database | `/opt/pulsarr/data/db/` |
| Logs | `/opt/pulsarr/data/logs/` |

---

## Windows

### Installer (Recommended)

1. Download the installer from the [latest release](https://github.com/jamcalli/Pulsarr/releases/latest):
   - **Most systems:** `pulsarr-vX.X.X-windows-x64-setup.exe`
   - **Older CPUs without AVX2:** `pulsarr-vX.X.X-windows-x64-baseline-setup.exe` (pre-Haswell Intel or pre-Excavator AMD)

2. Run the installer
   :::note SmartScreen Warning
   Windows may show a SmartScreen warning since the installer isn't code-signed. Click **"More info"** then **"Run anyway"** to proceed.
   :::

3. Choose your installation options:
   - **Install as Windows Service** (recommended) — runs in background without login
   - **Create desktop shortcut** — optional

4. Open http://localhost:3003 to complete setup

#### Managing the Service

Use the Windows Services app (`services.msc`) or command line:

```batch
:: Using the service wrapper
pulsarr-service.exe stop
pulsarr-service.exe start
pulsarr-service.exe restart

:: Or use net commands
net stop pulsarr
net start pulsarr
```

#### Updating

1. Download and run the new installer
2. It will stop the service, update files, and restart automatically
3. Your configuration and data are preserved

#### Uninstalling

Use **Add or Remove Programs** in Windows Settings, or run the uninstaller from the Start Menu. You'll be prompted to keep or delete your data.

#### Data Locations

| Item | Location |
|------|----------|
| Application | `C:\ProgramData\Pulsarr\` |
| Configuration | `C:\ProgramData\Pulsarr\.env` |
| Database | `C:\ProgramData\Pulsarr\data\db\` |
| Logs | `C:\ProgramData\Pulsarr\data\logs\` |

---

## macOS

### App Bundle (Recommended)

1. Download `pulsarr-vX.X.X-macos-{arch}.dmg` from the [latest release](https://github.com/jamcalli/Pulsarr/releases/latest)
   - **Apple Silicon (M1/M2/M3):** `macos-arm64`
   - **Intel Macs:** `macos-x64`

2. Open the DMG and drag `Pulsarr.app` to the Applications folder

3. Open Terminal and run this command to allow the app to run:
   ```bash
   xattr -rd com.apple.quarantine /Applications/Pulsarr.app
   ```
   :::note Why is this needed?
   macOS applies a quarantine flag to downloaded files. This command removes it so the app can launch normally.
   :::

4. Open Pulsarr from Applications (or Spotlight). Pulsarr runs as a background service — it won't appear in the Dock or App Switcher. Access it via your browser.

5. Open http://localhost:3003 to complete setup

**Requirements:** macOS 13.0 (Ventura) or later

#### Auto-Start on Login (Optional)

Create a LaunchAgent to start Pulsarr automatically:

```bash
cat > ~/Library/LaunchAgents/com.pulsarr.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pulsarr</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/Pulsarr.app/Contents/MacOS/pulsarr</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.pulsarr.plist
```

Manage with:
```bash
launchctl stop com.pulsarr
launchctl start com.pulsarr
launchctl unload ~/Library/LaunchAgents/com.pulsarr.plist  # disable auto-start
```

#### Updating

1. Quit Pulsarr (or stop the LaunchAgent)
2. Download the new version and drag to Applications (replace existing)
3. Re-run the quarantine removal command
4. Reopen Pulsarr — your data is preserved

#### Data Locations

| Item | Location |
|------|----------|
| Application | `/Applications/Pulsarr.app` |
| Configuration | `~/.config/Pulsarr/.env` |
| Database | `~/.config/Pulsarr/db/` |
| Logs | `~/.config/Pulsarr/logs/` |

---

## Manual Installation (Advanced)

For users who prefer full control, standalone zip files are available for each platform. These contain all necessary files to run Pulsarr without an installer.

1. Download the zip for your platform from the [latest release](https://github.com/jamcalli/Pulsarr/releases/latest):
   - `pulsarr-vX.X.X-linux-x64.zip`
   - `pulsarr-vX.X.X-linux-arm64.zip`
   - `pulsarr-vX.X.X-macos-x64.zip`
   - `pulsarr-vX.X.X-macos-arm64.zip`
   - `pulsarr-vX.X.X-windows-x64.zip`
   - `pulsarr-vX.X.X-windows-x64-baseline.zip` (older CPUs without AVX2)

2. Extract the zip to your desired location

3. Copy `.env.example` to `.env` and edit your settings

4. Run:
   - **Linux/macOS:** `./start.sh`
   - **Windows:** `start.bat`

5. Open http://localhost:3003 to complete setup

Each zip includes a `README.txt` with platform-specific instructions for running as a service.
