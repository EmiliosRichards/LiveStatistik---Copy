import { getServerSession as gss } from 'next-auth';
import { authOptions } from '@/src/app/api/auth/[...nextauth]/route';

export function getServerSession() {
  return gss(authOptions as any);
}

export async function requireRole(role: 'admin' | 'user') {
  const session = await getServerSession();
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }
  const roles = ((session.user as any).roles || []) as string[];
  if (!roles.includes(role)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return session;
}

import { getServerSession as gss } from 'next-auth';
import type { NextRequest } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export function getServerSession() {
  return gss(authOptions as any);
}

export async function requireRole(role: 'admin' | 'user') {
  const session = await getServerSession();
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }
  const roles = ((session.user as any).roles || []) as string[];
  if (!roles.includes(role)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return session;
}
