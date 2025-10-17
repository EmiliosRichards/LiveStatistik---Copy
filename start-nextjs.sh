#!/bin/bash

# Install dependencies if needed
if [ ! -d "web/node_modules" ]; then
  echo "📦 Installing Next.js dependencies..."
  cd web && npm install
  cd ..
fi

# Start Next.js on port 3000
echo "🚀 Starting Next.js app on port 3000..."
cd web && PORT=3000 npm run dev
