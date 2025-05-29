#!/bin/bash
set -e

echo "🚀 Starting documentation build process..."

# Step 1: Generate OpenAPI spec
echo "📄 Generating OpenAPI spec..."
npm run openapi:generate

# Step 2: Generate Docusaurus OpenAPI docs
echo "📚 Generating Docusaurus OpenAPI documentation..."
cd docs
npx docusaurus gen-api-docs pulsarr
cd ..

# Step 3: Format all files with Biome
echo "🎨 Formatting files with Biome..."
npm run fix

# Step 4: Build Docusaurus
echo "🏗️ Building Docusaurus..."
cd docs
npm run build
cd ..

echo "✅ Documentation build complete!"