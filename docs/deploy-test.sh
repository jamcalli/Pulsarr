#!/bin/bash

# Test deployment script for current branch
echo "Building documentation..."
npm run build

echo "Deploying to GitHub Pages..."
GIT_USER=$(git config user.name) npm run deploy

echo "Documentation should be available at:"
echo "https://jamcalli.github.io/pulsarr/"