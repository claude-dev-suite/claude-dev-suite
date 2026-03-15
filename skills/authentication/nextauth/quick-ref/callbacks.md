# NextAuth.js Callbacks Quick Reference

> **Knowledge Base:** Read `knowledge/nextauth/callbacks.md` for complete documentation.

## All Callbacks

```typescript
export const authOptions: NextAuthOptions = {
  callbacks: {
    // Control sign-in access
    async signIn({ user, account, profile, email, credentials }) {
      // Return true to allow sign in
      // Return false to deny access
      // Return URL string to redirect

      // Example: Only allow verified emails
      if (account?.provider === 'google') {
        return profile?.email_verified === true;
      }

      // Example: Check if user exists in database
      const existingUser = await getUserByEmail(user.email!);
      if (!existingUser) {
        // Create new user
        await createUser({ email: user.email, name: user.name });
      }

      return true;
    },

    // Customize redirect behavior
    async redirect({ url, baseUrl }) {
      // Relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Callback URLs on same origin
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },

    // Customize JWT token
    async jwt({ token, user, account, profile, trigger, session }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Handle session update
      if (trigger === 'update' && session) {
        token.name = session.name;
      }

      // Add access token from OAuth provider
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }

      return token;
    },

    // Customize session object
    async session({ session, token, user }) {
      // JWT strategy: use token
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.accessToken = token.accessToken as string;
      }

      // Database strategy: use user
      if (user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }

      return session;
    },
  },
};
```

## Type Extensions

```typescript
// types/next-auth.d.ts
import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
    accessToken?: string;
  }

  interface User extends DefaultUser {
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    accessToken?: string;
    provider?: string;
  }
}
```

## Common Patterns

### Add Role from Database

```typescript
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      // Fetch role from database
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      token.role = dbUser?.role || 'user';
    }
    return token;
  },
  async session({ session, token }) {
    session.user.role = token.role;
    return session;
  },
}
```

### Link Accounts

```typescript
callbacks: {
  async signIn({ user, account }) {
    if (account?.provider !== 'credentials') {
      // Check if email is already linked to another account
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email! },
        include: { accounts: true },
      });

      if (existingUser) {
        // Link account to existing user
        const hasProvider = existingUser.accounts.some(
          a => a.provider === account.provider
        );

        if (!hasProvider) {
          await prisma.account.create({
            data: {
              userId: existingUser.id,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              type: account.type,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
            },
          });
        }
      }
    }
    return true;
  },
}
```

### Restrict Access by Domain

```typescript
callbacks: {
  async signIn({ user, account }) {
    const allowedDomains = ['company.com', 'partner.com'];
    const emailDomain = user.email?.split('@')[1];

    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      return '/auth/error?error=AccessDenied';
    }

    return true;
  },
}
```

### Refresh Access Token

```typescript
callbacks: {
  async jwt({ token, account }) {
    if (account) {
      token.accessToken = account.access_token;
      token.refreshToken = account.refresh_token;
      token.expiresAt = account.expires_at! * 1000;
      return token;
    }

    // Return previous token if not expired
    if (Date.now() < (token.expiresAt as number)) {
      return token;
    }

    // Refresh token
    try {
      const response = await fetch('https://provider.com/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken as string,
          client_id: process.env.CLIENT_ID!,
          client_secret: process.env.CLIENT_SECRET!,
        }),
      });

      const tokens = await response.json();

      return {
        ...token,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? token.refreshToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };
    } catch {
      return { ...token, error: 'RefreshAccessTokenError' };
    }
  },
}
```

## Events

```typescript
export const authOptions: NextAuthOptions = {
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('User signed in:', user.email);
      await logActivity('sign_in', user.id);
    },
    async signOut({ session, token }) {
      console.log('User signed out');
      await logActivity('sign_out', token.id);
    },
    async createUser({ user }) {
      console.log('New user created:', user.email);
      await sendWelcomeEmail(user.email!);
    },
    async linkAccount({ user, account, profile }) {
      console.log(`Linked ${account.provider} to user ${user.id}`);
    },
    async session({ session, token }) {
      // Called whenever a session is checked
    },
  },
};
```

**Official docs:** https://next-auth.js.org/configuration/callbacks
