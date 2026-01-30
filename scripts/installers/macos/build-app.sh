#!/bin/bash
### Description: Pulsarr macOS .app bundle builder
### Creates a macOS application bundle from the native build
###
### Usage:
###   ./build-app.sh <version> <arch>
###   ./build-app.sh v0.10.0 arm64
###
### Requires: Running from the extracted native build directory

set -euo pipefail

VERSION="${1:?Usage: build-app.sh <version> <arch>}"
ARCH="${2:?Usage: build-app.sh <version> <arch>}"

# Strip 'v' prefix if present for version numbers
VERSION_NUM="${VERSION#v}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="Pulsarr.app"

echo "Building ${APP} version ${VERSION} for ${ARCH}..."

# Clean up any existing .app
rm -rf "$APP"

# Create .app bundle structure
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

# Copy all runtime files to MacOS directory
cp -r bun start.sh dist migrations packages node_modules "$APP/Contents/MacOS/"

# Make bun and start.sh executable
chmod +x "$APP/Contents/MacOS/bun"
chmod +x "$APP/Contents/MacOS/start.sh"

# Copy resources
cp .env.example "$APP/Contents/Resources/"
cp "${SCRIPT_DIR}/pulsarr.icns" "$APP/Contents/Resources/"

# Create wrapper script that sets dataDir for user config location
cat > "$APP/Contents/MacOS/pulsarr" << 'WRAPPER_EOF'
#!/bin/bash
set -euo pipefail

# Set data directory to user's config folder
export dataDir="$HOME/.config/Pulsarr"

# Create data directory structure if needed
mkdir -p "$dataDir/db" "$dataDir/logs"

# Copy .env.example if .env doesn't exist
if [[ ! -f "$dataDir/.env" ]]; then
    cp "$(dirname "$0")/../Resources/.env.example" "$dataDir/.env"
    echo "Created $dataDir/.env - please configure before first run"
fi

# Change to MacOS directory and run
cd "$(dirname "$0")"
exec ./start.sh "$@"
WRAPPER_EOF
chmod +x "$APP/Contents/MacOS/pulsarr"

# Create Info.plist
cat > "$APP/Contents/Info.plist" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Pulsarr</string>
    <key>CFBundleDisplayName</key>
    <string>Pulsarr</string>
    <key>CFBundleExecutable</key>
    <string>pulsarr</string>
    <key>CFBundleIdentifier</key>
    <string>com.pulsarr.app</string>
    <key>CFBundleVersion</key>
    <string>${VERSION_NUM}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION_NUM}</string>
    <key>CFBundleIconFile</key>
    <string>pulsarr</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
PLIST_EOF

# Create the output zip
OUTPUT_NAME="pulsarr-${VERSION}-macos-${ARCH}-app.zip"
zip -qry "$OUTPUT_NAME" "$APP"

# Clean up .app directory
rm -rf "$APP"

echo "Created ${OUTPUT_NAME}"
