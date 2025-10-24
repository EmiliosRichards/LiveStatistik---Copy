#!/bin/bash

# Start Express backend on port 5001 in background
echo "🚀 Starting Express backend on port 5001..."
PORT=5001 npm run dev &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start Next.js app on port 5000 (frontend visible to user)
echo "🚀 Starting Next.js app on port 5000..."
cd web && PORT=5000 npm run dev

# Clean up background process on exit
trap "kill $BACKEND_PID 2>/dev/null" EXIT
