#!/bin/bash
set -e

# Production startup script for Next.js + Express architecture
# Next.js (port 5000, external) proxies API requests to Express (port 5001, internal)
# NOTE: This assumes build-prod.sh has already been run

echo "🚀 Starting Express backend on port 5001 (internal)..."
PORT=5001 NODE_ENV=production node dist/index.js > /tmp/express.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for Express backend..."
for i in {1..15}; do
  if curl -f http://localhost:5001/healthz > /dev/null 2>&1; then
    echo "✅ Express backend is ready on port 5001!"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "❌ Express backend failed to start. Logs:"
    cat /tmp/express.log
    exit 1
  fi
  echo "Waiting for Express backend... ($i/15)"
  sleep 2
done

echo "🚀 Starting Next.js app on port 5000 (external)..."
# Start Next.js in foreground to keep the process alive
cd web && exec PORT=5000 npm start
