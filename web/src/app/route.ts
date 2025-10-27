import { NextResponse } from 'next/server'

// Simple health check endpoint for deployment
export async function GET() {
  return NextResponse.json({ 
    ok: true, 
    status: 'healthy',
    timestamp: new Date().toISOString() 
  }, { status: 200 })
}
