#!/bin/bash

# Production startup script for Next.js + Express architecture
# Next.js (port 5000, external) proxies API requests to Express (port 5001, internal)

echo "🏗️  Building Express backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "🏗️  Building Next.js frontend..."
cd web && npm run build && cd ..

echo "🚀 Starting Express backend on port 5001 (internal)..."
PORT=5001 NODE_ENV=production node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

echo "🚀 Starting Next.js app on port 5000 (external)..."
cd web && PORT=5000 npm start &
FRONTEND_PID=$!

# Keep script running and handle cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

# Wait for both processes
wait
