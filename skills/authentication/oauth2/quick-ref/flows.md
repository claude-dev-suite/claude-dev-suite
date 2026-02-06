# OAuth 2.0 Flows Quick Reference

> **Knowledge Base:** Read `knowledge/oauth2/flows.md` for complete documentation.

## Authorization Code Flow (Recommended)

```
1. User clicks "Login with Provider"
2. App redirects to Provider's authorization URL
3. User authenticates and approves
4. Provider redirects back with authorization code
5. App exchanges code for tokens (server-side)
6. App uses access token to call APIs
```

```typescript
// Step 1: Build authorization URL
const authUrl = new URL('https://provider.com/oauth/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', generateState());

// Redirect user
res.redirect(authUrl.toString());

// Step 2: Handle callback
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state
  if (state !== getStoredState()) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://provider.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code as string,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const { access_token, refresh_token, id_token } = await tokenResponse.json();

  // Use tokens...
});
```

## Authorization Code Flow with PKCE (for SPAs/Mobile)

```typescript
// Generate PKCE challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Step 1: Authorization request with PKCE
const { verifier, challenge } = generatePKCE();
sessionStorage.setItem('pkce_verifier', verifier);

const authUrl = new URL('https://provider.com/oauth/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', generateState());
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

window.location.href = authUrl.toString();

// Step 2: Exchange with verifier
const verifier = sessionStorage.getItem('pkce_verifier');

const tokenResponse = await fetch('https://provider.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }),
});
```

## Client Credentials Flow (Machine-to-Machine)

```typescript
// Server-to-server authentication
async function getM2MToken() {
  const response = await fetch('https://provider.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'api:read api:write',
    }),
  });

  const { access_token, expires_in } = await response.json();
  return access_token;
}
```

## Refresh Token Flow

```typescript
async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://provider.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const { access_token, refresh_token, expires_in } = await response.json();
  return { accessToken: access_token, refreshToken: refresh_token };
}
```

## Common Providers

```typescript
// Google
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = 'openid profile email';

// GitHub
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_SCOPES = 'read:user user:email';

// Microsoft
const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_SCOPES = 'openid profile email User.Read';
```

## State & Nonce

```typescript
// State: CSRF protection
function generateState(): string {
  const state = crypto.randomBytes(32).toString('hex');
  // Store in session/cookie
  req.session.oauthState = state;
  return state;
}

function verifyState(returnedState: string, storedState: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(returnedState),
    Buffer.from(storedState)
  );
}

// Nonce: Replay protection (OpenID Connect)
function generateNonce(): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  req.session.oauthNonce = nonce;
  return nonce;
}
```

## Token Storage

```typescript
interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
}

class TokenStore {
  private tokens: TokenSet | null = null;

  setTokens(tokens: TokenSet) {
    this.tokens = tokens;
  }

  getAccessToken(): string | null {
    if (!this.tokens) return null;
    if (Date.now() >= this.tokens.expiresAt) {
      // Token expired, needs refresh
      return null;
    }
    return this.tokens.accessToken;
  }

  async getValidAccessToken(): Promise<string> {
    const token = this.getAccessToken();
    if (token) return token;

    if (this.tokens?.refreshToken) {
      const newTokens = await refreshAccessToken(this.tokens.refreshToken);
      this.setTokens(newTokens);
      return newTokens.accessToken;
    }

    throw new Error('No valid token available');
  }
}
```

**Official docs:** https://oauth.net/2/
