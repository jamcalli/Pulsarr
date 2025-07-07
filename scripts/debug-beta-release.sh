#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo -e "${YELLOW}🚀 Creating debug beta release from branch: ${CURRENT_BRANCH}${NC}"
echo -e "${YELLOW}📦 Current version: ${CURRENT_VERSION}${NC}"

# Check if we're on the debug branch
if [[ "$CURRENT_BRANCH" != "debug/session-monitor" ]]; then
    echo -e "${RED}❌ This script should only be run from the debug/session-monitor branch${NC}"
    echo -e "${RED}   Current branch: ${CURRENT_BRANCH}${NC}"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ You have uncommitted changes. Please commit or stash them first.${NC}"
    git status --short
    exit 1
fi

# Create version with debug suffix
NEW_VERSION="${CURRENT_VERSION}-debug-beta.$(date +%Y%m%d%H%M%S)"
echo -e "${YELLOW}🏷️  Creating version: ${NEW_VERSION}${NC}"

# Update package.json version
npm version --no-git-tag-version "${NEW_VERSION}"

# Commit the version change
git add package.json
git commit -m "chore: bump version to ${NEW_VERSION} for debug beta release

🔍 Enhanced session monitoring debugging:
- Added comprehensive console logging throughout session monitoring service
- Database query debugging with SQL and bindings
- TVDB ID extraction process logging
- Rolling show lookup step-by-step debugging

Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Create and push tag
git tag "v${NEW_VERSION}"
git push origin "${CURRENT_BRANCH}"
git push origin "v${NEW_VERSION}"

echo -e "${GREEN}✅ Debug beta release created successfully!${NC}"
echo -e "${GREEN}🐳 Docker image will be available as: lakker/pulsarr:debug-beta${NC}"
echo -e "${GREEN}🏷️  Tag: v${NEW_VERSION}${NC}"
echo -e "${GREEN}📋 GitHub release: https://github.com/jamcalli/Pulsarr/releases/tag/v${NEW_VERSION}${NC}"