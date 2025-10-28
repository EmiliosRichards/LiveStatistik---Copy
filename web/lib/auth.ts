import { getServerSession as gss } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export function getServerSession(): Promise<Session | null> {
  return gss(authOptions);
}

export async function requireRole(role: 'admin' | 'user'): Promise<Session> {
  const session = await getServerSession();
  if (!session || !session.user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  
  const userWithRoles = session.user as { roles?: string[] };
  const roles = userWithRoles.roles || [];
  
  if (!roles.includes(role)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return session;
}
