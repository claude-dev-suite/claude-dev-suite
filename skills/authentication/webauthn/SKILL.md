---
name: webauthn
description: |
  WebAuthn/FIDO2 passwordless authentication. Passkeys, registration and
  authentication ceremonies, SimpleWebAuthn library, resident credentials,
  and platform/cross-platform authenticators.

  USE WHEN: user mentions "WebAuthn", "FIDO2", "passkey", "passwordless",
  "biometric login", "security key", "fingerprint login", "SimpleWebAuthn"

  DO NOT USE FOR: password-based auth - use `jwt` or `oauth2`;
  magic links - different flow; OAuth social login - use `oauth2`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# WebAuthn / Passkeys

## Server Setup (SimpleWebAuthn)

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const rpName = 'My App';
const rpID = 'myapp.com';
const origin = 'https://myapp.com';
```

## Registration Flow

### Server: Generate Options

```typescript
app.post('/api/auth/register/options', auth, async (req, res) => {
  const user = req.user;
  const existingCredentials = await db.credential.findMany({
    where: { userId: user.id },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge for verification
  await db.challenge.upsert({
    where: { userId: user.id },
    create: { userId: user.id, challenge: options.challenge },
    update: { challenge: options.challenge },
  });

  res.json(options);
});
```

### Server: Verify Registration

```typescript
app.post('/api/auth/register/verify', auth, async (req, res) => {
  const user = req.user;
  const { challenge } = await db.challenge.findUnique({ where: { userId: user.id } });

  const verification = await verifyRegistrationResponse({
    response: req.body,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (verification.verified && verification.registrationInfo) {
    const { credential } = verification.registrationInfo;
    await db.credential.create({
      data: {
        userId: user.id,
        credentialId: Buffer.from(credential.id),
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: req.body.response.transports,
      },
    });
  }

  res.json({ verified: verification.verified });
});
```

## Authentication Flow

### Server: Generate Options

```typescript
app.post('/api/auth/login/options', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // For passkeys (discoverable credentials), omit allowCredentials
  });

  // Store challenge in session
  req.session.challenge = options.challenge;
  res.json(options);
});
```

### Server: Verify Authentication

```typescript
app.post('/api/auth/login/verify', async (req, res) => {
  const credential = await db.credential.findUnique({
    where: { credentialId: Buffer.from(req.body.id, 'base64url') },
  });

  const verification = await verifyAuthenticationResponse({
    response: req.body,
    expectedChallenge: req.session.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credentialId,
      publicKey: credential.publicKey,
      counter: credential.counter,
    },
  });

  if (verification.verified) {
    // Update counter (replay protection)
    await db.credential.update({
      where: { id: credential.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    const token = generateJWT(credential.userId);
    res.json({ verified: true, token });
  }
});
```

## Browser Client

```typescript
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Register
async function registerPasskey() {
  const optionsRes = await fetch('/api/auth/register/options', { method: 'POST' });
  const options = await optionsRes.json();

  const credential = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });
  return (await verifyRes.json()).verified;
}

// Login
async function loginWithPasskey() {
  const optionsRes = await fetch('/api/auth/login/options', { method: 'POST' });
  const options = await optionsRes.json();

  const credential = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });
  return (await verifyRes.json()).token;
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Not storing counter | Store and verify counter to prevent replay attacks |
| Reusing challenges | Generate fresh challenge for each ceremony |
| No fallback auth method | Offer password/magic link as fallback |
| Hardcoded rpID | Configure from environment, must match domain |
| Missing transports on exclude | Store transports to improve UX on re-registration |

## Production Checklist

- [ ] HTTPS required (WebAuthn mandates secure context)
- [ ] Challenge generated per ceremony and expired
- [ ] Counter stored and verified
- [ ] Multiple credentials per user supported
- [ ] Credential management UI (view, revoke)
- [ ] Fallback authentication method available
