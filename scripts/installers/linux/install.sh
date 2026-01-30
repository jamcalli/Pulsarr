#!/bin/bash
### Description: Pulsarr Linux installer
### Installs Pulsarr to /opt/pulsarr with systemd service
###
### Usage:
###   curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/main/scripts/installers/linux/install.sh | sudo bash
###   ./install.sh --uninstall
###
### Boilerplate Warning
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
# LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
# OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
# WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

set -euo pipefail

# Configuration
APP="pulsarr"
APP_NAME="Pulsarr"
APP_PORT="3003"
APP_USER="pulsarr"
APP_GROUP="pulsarr"
INSTALL_DIR="/opt/pulsarr"
GITHUB_REPO="jamcalli/Pulsarr"
SERVICE_FILE="/etc/systemd/system/pulsarr.service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
die() { error "$1"; exit 1; }

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root. Try: sudo $0"
    fi
}

# Check for systemd
check_systemd() {
    if ! command -v systemctl &> /dev/null; then
        error "systemd is required but not found."
        echo ""
        echo "For systems without systemd (Alpine, older distros), use Docker instead:"
        echo "  docker run -d -p 3003:3003 -v ./data:/app/data lakker/pulsarr:latest"
        echo ""
        exit 1
    fi
}

# Detect system architecture
detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            echo "x64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            die "Unsupported architecture: $arch. Supported: x86_64, aarch64"
            ;;
    esac
}

# Get latest release version from GitHub
get_latest_version() {
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    if [[ -z "$version" ]]; then
        die "Failed to fetch latest version from GitHub"
    fi
    echo "$version"
}

# Download and extract release
download_release() {
    local version="$1"
    local arch="$2"
    local zip_name="pulsarr-${version}-linux-${arch}.zip"
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${zip_name}"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    info "Downloading ${APP_NAME} ${version} for linux-${arch}..." >&2

    if ! curl -fsSL "$download_url" -o "${tmp_dir}/${zip_name}"; then
        rm -rf "$tmp_dir"
        die "Failed to download release from: $download_url"
    fi

    info "Extracting..." >&2
    if ! unzip -q "${tmp_dir}/${zip_name}" -d "$tmp_dir"; then
        rm -rf "$tmp_dir"
        die "Failed to extract release"
    fi

    # Find the extracted directory (pulsarr-vX.X.X-linux-arch)
    local extracted_dir
    extracted_dir=$(find "$tmp_dir" -maxdepth 1 -type d -name "pulsarr-*" | head -1)

    if [[ -z "$extracted_dir" ]]; then
        rm -rf "$tmp_dir"
        die "Failed to find extracted directory"
    fi

    echo "$extracted_dir"
}

# Create system user
create_user() {
    if id "$APP_USER" &>/dev/null; then
        info "User '$APP_USER' already exists"
    else
        info "Creating system user '$APP_USER'..."
        useradd -r -s /usr/sbin/nologin -M "$APP_USER"
    fi

    # Ensure group exists
    if ! getent group "$APP_GROUP" &>/dev/null; then
        groupadd "$APP_GROUP"
    fi
}

# Install application files
install_files() {
    local src_dir="$1"

    # Backup existing .env and data if present
    local env_backup=""
    local data_backup=""

    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        info "Backing up existing .env..."
        env_backup=$(mktemp)
        cp "${INSTALL_DIR}/.env" "$env_backup"
    fi

    if [[ -d "${INSTALL_DIR}/data" ]]; then
        info "Backing up existing data directory..."
        data_backup=$(mktemp -d)
        cp -r "${INSTALL_DIR}/data" "$data_backup/"
    fi

    # Remove old installation (except .env and data which are backed up)
    if [[ -d "$INSTALL_DIR" ]]; then
        info "Removing old installation..."
        rm -rf "$INSTALL_DIR"
    fi

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Copy new files
    info "Installing files to ${INSTALL_DIR}..."
    cp -r "${src_dir}/." "${INSTALL_DIR}/"

    # Remove any .env or data from the source (fresh install shouldn't have user data)
    rm -f "${INSTALL_DIR}/.env" 2>/dev/null || true
    rm -rf "${INSTALL_DIR}/data" 2>/dev/null || true

    # Restore backups
    if [[ -n "$env_backup" && -f "$env_backup" ]]; then
        info "Restoring .env..."
        cp "$env_backup" "${INSTALL_DIR}/.env"
        rm "$env_backup"
    fi

    if [[ -n "$data_backup" && -d "${data_backup}/data" ]]; then
        info "Restoring data directory..."
        cp -r "${data_backup}/data" "${INSTALL_DIR}/"
        rm -rf "$data_backup"
    fi

    # Create data directories if they don't exist
    mkdir -p "${INSTALL_DIR}/data/db"
    mkdir -p "${INSTALL_DIR}/data/logs"

    # Create .env from template if it doesn't exist
    if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
        cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    fi

    # Set ownership
    chown -R "${APP_USER}:${APP_GROUP}" "$INSTALL_DIR"

    # Make start script executable
    chmod +x "${INSTALL_DIR}/start.sh"
    chmod +x "${INSTALL_DIR}/bun"
}

# Create systemd service
create_service() {
    info "Creating systemd service..."

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=${APP_NAME}
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/start.sh
Restart=on-failure
RestartSec=5

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
}

# Start service
start_service() {
    info "Enabling and starting ${APP_NAME} service..."
    systemctl enable "$APP" --quiet
    systemctl start "$APP"
}

# Stop service if running
stop_service() {
    if systemctl is-active --quiet "$APP" 2>/dev/null; then
        info "Stopping ${APP_NAME} service..."
        systemctl stop "$APP"
    fi
}

# Uninstall function
uninstall() {
    check_root

    info "Uninstalling ${APP_NAME}..."

    # Stop and disable service
    if systemctl is-active --quiet "$APP" 2>/dev/null; then
        info "Stopping service..."
        systemctl stop "$APP"
    fi

    if systemctl is-enabled --quiet "$APP" 2>/dev/null; then
        info "Disabling service..."
        systemctl disable "$APP" --quiet
    fi

    # Remove service file
    if [[ -f "$SERVICE_FILE" ]]; then
        info "Removing service file..."
        rm "$SERVICE_FILE"
        systemctl daemon-reload
    fi

    # Remove user
    if id "$APP_USER" &>/dev/null; then
        info "Removing user '$APP_USER'..."
        userdel "$APP_USER" 2>/dev/null || true
    fi

    # Ask about data
    if [[ -d "$INSTALL_DIR" ]]; then
        echo ""
        read -r -p "Delete application data (${INSTALL_DIR})? [y/N] " response < /dev/tty
        if [[ "$response" =~ ^[Yy]$ ]]; then
            info "Removing ${INSTALL_DIR}..."
            rm -rf "$INSTALL_DIR"
        else
            info "Keeping ${INSTALL_DIR} (you can remove it manually later)"
        fi
    fi

    info "${APP_NAME} has been uninstalled."
}

# Show completion message
show_complete() {
    local version="$1"
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN} ${APP_NAME} ${version} installed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "  Web UI:    http://${ip}:${APP_PORT}"
    echo "  Config:    ${INSTALL_DIR}/.env"
    echo "  Data:      ${INSTALL_DIR}/data/"
    echo "  Logs:      ${INSTALL_DIR}/data/logs/"
    echo ""
    echo "Service commands:"
    echo "  sudo systemctl status ${APP}"
    echo "  sudo systemctl stop ${APP}"
    echo "  sudo systemctl restart ${APP}"
    echo "  sudo journalctl -u ${APP} -f"
    echo ""

    # Check if service is running
    sleep 2
    if systemctl is-active --quiet "$APP"; then
        info "Service is running. Open http://${ip}:${APP_PORT} to complete setup."
    else
        warn "Service may not have started. Check: sudo systemctl status ${APP}"
    fi
}

# Main installation
install() {
    check_root
    check_systemd

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN} ${APP_NAME} Linux Installer${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    # Check prerequisites
    for cmd in curl unzip; do
        if ! command -v "$cmd" &> /dev/null; then
            die "Required command not found: $cmd. Install it with your package manager."
        fi
    done

    local arch version extracted_dir

    arch=$(detect_arch)
    info "Detected architecture: $arch"

    version=$(get_latest_version)
    info "Latest version: $version"

    # Stop existing service if running
    stop_service

    # Download and extract
    extracted_dir=$(download_release "$version" "$arch")

    # Create user
    create_user

    # Install files
    install_files "$extracted_dir"

    # Cleanup temp files
    rm -rf "$(dirname "$extracted_dir")"

    # Create and start service
    create_service
    start_service

    # Show completion message
    show_complete "$version"
}

# Parse arguments
main() {
    case "${1:-}" in
        --uninstall|-u)
            uninstall
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --uninstall, -u    Uninstall ${APP_NAME}"
            echo "  --help, -h         Show this help message"
            echo ""
            echo "Install:"
            echo "  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/installers/linux/install.sh | sudo bash"
            ;;
        "")
            install
            ;;
        *)
            die "Unknown option: $1. Use --help for usage."
            ;;
    esac
}

main "$@"
