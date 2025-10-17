import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/signin' },
  callbacks: {
    authorized({ token }) {
      // no session token → redirect to /signin
      return !!token;
    },
  },
});

// Match the root and all paths except the excluded ones
export const config = {
  matcher: ['/', '/((?!api/auth|_next/|favicon.ico|healthz|signin).*)'],
};