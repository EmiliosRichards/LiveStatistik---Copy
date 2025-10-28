#!/bin/bash

# Production startup script for Next.js + Express architecture
# Next.js (port 5000, external) proxies API requests to Express (port 5001, internal)
# NOTE: This assumes build-prod.sh has already been run

echo "🚀 Starting Express backend on port 5001 (internal)..."
PORT=5001 NODE_ENV=production node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for Express backend..."
sleep 3
curl -f http://localhost:5001/healthz || echo "⚠️  Backend health check failed"

echo "🚀 Starting Next.js app on port 5000 (external)..."
cd web && PORT=5000 npm start &
FRONTEND_PID=$!
cd ..

# Wait for Next.js to be fully ready before accepting traffic
echo "⏳ Waiting for Next.js to be ready..."
for i in {1..30}; do
  if curl -f http://localhost:5000/healthz > /dev/null 2>&1; then
    echo "✅ Next.js is ready!"
    break
  fi
  echo "Waiting for Next.js... ($i/30)"
  sleep 2
done

# Verify both services are responding
echo "🔍 Verifying services..."
curl -f http://localhost:5001/healthz && echo "✅ Express backend responding"
curl -f http://localhost:5000/healthz && echo "✅ Next.js frontend responding"

echo "✅ All services started successfully!"

# Keep script running and handle cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

# Wait for both processes
wait
