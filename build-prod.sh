#!/bin/bash
set -e

echo "🏗️  Building Express backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "🏗️  Building Next.js frontend..."
cd web && npm run build

echo "✅ Production build complete!"
