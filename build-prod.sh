#!/bin/bash
set -e

echo "🏗️  Building Express backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "🏗️  Building Next.js frontend..."
cd web && npm run build && cd ..

echo "✅ Verifying public assets are accessible..."
if [ -f "web/public/Manuav-web-site-LOGO.png" ]; then
  echo "✅ Logo file exists: web/public/Manuav-web-site-LOGO.png"
else
  echo "⚠️  Warning: Logo file not found!"
fi

echo "✅ Production build complete!"
echo "📦 Next.js built to: web/.next/"
echo "📦 Express built to: dist/index.js"
echo "📦 Public assets at: web/public/"
