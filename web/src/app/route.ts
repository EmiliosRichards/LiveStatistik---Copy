import { NextResponse } from 'next/server'

// Root health check endpoint for deployment health checks
// Redirects browsers to /dashboard, returns JSON for health checkers
export function GET(request: Request) {
  const userAgent = request.headers.get('user-agent') || ''
  
  // If it's a browser (not a health checker), redirect to dashboard
  if (userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  // For health checkers, return simple 200 OK
  return NextResponse.json({ 
    ok: true, 
    status: 'healthy',
    ts: new Date().toISOString() 
  })
}
