import NextAuth, { NextAuthOptions } from 'next-auth';
import AzureAD from 'next-auth/providers/azure-ad';
import Credentials from 'next-auth/providers/credentials';

const GROUP_ID_USERS = process.env.GROUP_ID_USERS;
const GROUP_ID_ADMINS = process.env.GROUP_ID_ADMINS;

// Build providers array conditionally
const providers: any[] = [];

// Only add Azure AD if credentials are properly configured
if (
  process.env.AZURE_AD_CLIENT_ID && 
  process.env.AZURE_AD_CLIENT_SECRET && 
  process.env.AZURE_AD_TENANT_ID &&
  process.env.AZURE_AD_CLIENT_ID !== 'NA' &&
  process.env.AZURE_AD_CLIENT_SECRET !== 'NA' &&
  process.env.AZURE_AD_TENANT_ID !== 'NA'
) {
  providers.push(AzureAD({
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    tenantId: process.env.AZURE_AD_TENANT_ID!,
  }));
  console.log('✅ Azure AD authentication enabled');
} else {
  console.log('⚠️ Azure AD credentials not configured - skipping Azure AD provider');
}

// Always add Guest credentials if enabled
if (process.env.ALLOW_GUEST === 'true') {
  providers.push(Credentials({
    name: 'Guest',
    credentials: {
      username: { label: 'Username', type: 'text' },
      password: { label: 'Password', type: 'password' }
    },
    async authorize(creds) {
      if (creds?.username === 'guest') {
        return { id: 'guest', name: 'Guest', email: 'guest@local' } as any;
      }
      return null;
    }
  }));
  console.log('✅ Guest authentication enabled');
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers,
  session: { strategy: 'jwt' as const, maxAge: 60 * 60 * 8 },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, account, user }) {
      // mark guest
      if (user && (user as any).email === 'guest@local') {
        (token as any).roles = ['guest'];
        return token;
      }
      let groups: string[] | undefined = (token as any).groups;
      if (!groups && account?.id_token) {
        try {
          const payload = JSON.parse(Buffer.from(account.id_token.split('.')[1], 'base64').toString());
          if (Array.isArray(payload.groups)) groups = payload.groups;
        } catch {}
      }
      const roles: string[] = [];
      if (groups?.includes(GROUP_ID_ADMINS!)) roles.push('admin');
      if (groups?.includes(GROUP_ID_USERS!)) roles.push('user');
      (token as any).roles = roles;
      (token as any).groups = groups || [];
      return token;
    },
    async session({ session, token }) {
      (session.user as any).roles = (token as any).roles || [];
      return session;
    },
    async signIn({ user, account }) {
      // Allow guest via credentials only when explicitly enabled
      if (account?.provider === 'credentials') {
        return process.env.ALLOW_GUEST === 'true';
      }
      // Allow Azure sign-ins; enforce role access at page/route guards
      return true;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
