#!/bin/bash
set -e

echo "🏗️  Building Express backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "🏗️  Building Next.js frontend..."
cd web && npm run build && cd ..

echo "✅ Production build complete!"
echo "📦 Next.js built to: web/.next/"
echo "📦 Express built to: dist/index.js"
