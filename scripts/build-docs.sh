#!/bin/bash
set -e

echo "🚀 Starting documentation build process..."

# Store original directory
ORIGINAL_DIR=$(pwd)

# Step 1: Generate OpenAPI spec
echo "📄 Generating OpenAPI spec..."
bun run openapi:generate

# Step 2: Clean old API docs
echo "🧹 Cleaning old API documentation..."
cd docs || { echo "Failed to change to docs directory"; exit 1; }
npm run docusaurus clean-api-docs pulsarr
cd "$ORIGINAL_DIR" || { echo "Failed to return to original directory"; exit 1; }

# Step 3: Generate fresh Docusaurus OpenAPI docs
echo "📚 Generating Docusaurus OpenAPI documentation..."
cd docs || { echo "Failed to change to docs directory"; exit 1; }
npm run docusaurus gen-api-docs pulsarr
cd "$ORIGINAL_DIR" || { echo "Failed to return to original directory"; exit 1; }

# Step 4: Format all files with Biome
echo "🎨 Formatting files with Biome..."
bun run fix

# Step 5: Build Docusaurus
echo "🏗️ Building Docusaurus..."
cd docs || { echo "Failed to change to docs directory"; exit 1; }
npm run build
cd "$ORIGINAL_DIR" || { echo "Failed to return to original directory"; exit 1; }

echo "✅ Documentation build complete!"
