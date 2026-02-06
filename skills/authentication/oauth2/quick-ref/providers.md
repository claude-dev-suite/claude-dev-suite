# OAuth 2.0 Providers Quick Reference

> **Knowledge Base:** Read `knowledge/oauth2/providers.md` for complete documentation.

## Google

```typescript
// Configuration
const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  scopes: ['openid', 'profile', 'email'],
};

// Build auth URL
const authUrl = new URL(GOOGLE_CONFIG.authorizationUrl);
authUrl.searchParams.set('client_id', GOOGLE_CONFIG.clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', GOOGLE_CONFIG.scopes.join(' '));
authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
authUrl.searchParams.set('prompt', 'consent'); // Force consent screen

// Get user info
const userInfo = await fetch(GOOGLE_CONFIG.userInfoUrl, {
  headers: { Authorization: `Bearer ${accessToken}` }
}).then(r => r.json());

// Response: { id, email, verified_email, name, given_name, family_name, picture }
```

## GitHub

```typescript
// Configuration
const GITHUB_CONFIG = {
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userUrl: 'https://api.github.com/user',
  emailsUrl: 'https://api.github.com/user/emails',
  scopes: ['read:user', 'user:email'],
};

// Token exchange (GitHub requires Accept header)
const tokenResponse = await fetch(GITHUB_CONFIG.tokenUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    client_id: GITHUB_CONFIG.clientId,
    client_secret: GITHUB_CONFIG.clientSecret,
    code: code,
    redirect_uri: REDIRECT_URI,
  }),
});

// Get user info
const user = await fetch(GITHUB_CONFIG.userUrl, {
  headers: { Authorization: `token ${accessToken}` }
}).then(r => r.json());

// Get primary email
const emails = await fetch(GITHUB_CONFIG.emailsUrl, {
  headers: { Authorization: `token ${accessToken}` }
}).then(r => r.json());

const primaryEmail = emails.find((e: any) => e.primary)?.email;
```

## Microsoft / Azure AD

```typescript
// Configuration
const MS_CONFIG = {
  clientId: process.env.MS_CLIENT_ID!,
  clientSecret: process.env.MS_CLIENT_SECRET!,
  tenant: 'common', // or specific tenant ID
  authorizationUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`,
  tokenUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
  userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

// Get user info via Microsoft Graph
const user = await fetch(MS_CONFIG.userInfoUrl, {
  headers: { Authorization: `Bearer ${accessToken}` }
}).then(r => r.json());

// Response: { id, displayName, givenName, surname, mail, userPrincipalName }
```

## Discord

```typescript
// Configuration
const DISCORD_CONFIG = {
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  authorizationUrl: 'https://discord.com/api/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  userUrl: 'https://discord.com/api/users/@me',
  scopes: ['identify', 'email'],
};

// Build auth URL
const authUrl = new URL(DISCORD_CONFIG.authorizationUrl);
authUrl.searchParams.set('client_id', DISCORD_CONFIG.clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', DISCORD_CONFIG.scopes.join(' '));

// Get user info
const user = await fetch(DISCORD_CONFIG.userUrl, {
  headers: { Authorization: `Bearer ${accessToken}` }
}).then(r => r.json());

// Avatar URL
const avatarUrl = user.avatar
  ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
  : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;
```

## Generic Provider Implementation

```typescript
interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

class OAuthClient {
  constructor(private provider: OAuthProvider) {}

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const url = new URL(this.provider.authorizationUrl);
    url.searchParams.set('client_id', this.provider.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.provider.scopes.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string) {
    const response = await fetch(this.provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.provider.clientId,
        client_secret: this.provider.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    return response.json();
  }

  async getUserInfo(accessToken: string) {
    const response = await fetch(this.provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.json();
  }
}
```

## Provider User Mapping

```typescript
interface NormalizedUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
}

function normalizeGoogleUser(user: any): NormalizedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: 'google',
  };
}

function normalizeGitHubUser(user: any, email: string): NormalizedUser {
  return {
    id: String(user.id),
    email: email,
    name: user.name || user.login,
    picture: user.avatar_url,
    provider: 'github',
  };
}
```

**Official docs:**
- Google: https://developers.google.com/identity/protocols/oauth2
- GitHub: https://docs.github.com/en/apps/oauth-apps
- Microsoft: https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
