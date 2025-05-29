#!/bin/bash
set -e

echo "🚀 Starting documentation build process..."

# Store original directory
ORIGINAL_DIR=$(pwd)

# Step 1: Generate OpenAPI spec
echo "📄 Generating OpenAPI spec..."
npm run openapi:generate

# Step 2: Generate Docusaurus OpenAPI docs
echo "📚 Generating Docusaurus OpenAPI documentation..."
cd docs || { echo "Failed to change to docs directory"; exit 1; }
npx docusaurus gen-api-docs pulsarr
cd "$ORIGINAL_DIR" || { echo "Failed to return to original directory"; exit 1; }

# Step 3: Format all files with Biome
echo "🎨 Formatting files with Biome..."
npm run fix

# Step 4: Build Docusaurus
echo "🏗️ Building Docusaurus..."
cd docs || { echo "Failed to change to docs directory"; exit 1; }
npm run build
cd "$ORIGINAL_DIR" || { echo "Failed to return to original directory"; exit 1; }

echo "✅ Documentation build complete!"