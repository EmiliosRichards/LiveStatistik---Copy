import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'disabled in production' }, { status: 404 })
  const session = await getServerSession()
  const roles = ((session?.user as any)?.roles || []) as string[]
  return NextResponse.json({ session, roles })
}


