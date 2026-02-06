---
name: secrets-management
description: |
  Secrets and credentials management. Covers environment variables, secret stores,
  rotation policies, and detection of leaked secrets.

  USE WHEN: user mentions "secrets", "credentials", "API keys", "environment variables", ".env", asks about "secret leaks", "vault", "secret rotation", "gitleaks", "secret detection"

  DO NOT USE FOR: OWASP vulnerabilities - use `owasp-top-10`, supply chain - use `supply-chain`, general security - use `owasp`
allowed-tools: Read, Grep, Glob
---

# Secrets Management

## Golden Rules

1. **Never commit secrets** to version control
2. **Never log secrets** in application logs
3. **Rotate secrets** regularly
4. **Use least privilege** for access
5. **Encrypt at rest** and in transit

## When NOT to Use This Skill
- **JWT/OAuth implementation** - Use authentication skills for protocol setup
- **Database security** - Use database skills for connection security
- **General OWASP issues** - Use `owasp-top-10` for broader security
- **Dependency vulnerabilities** - Use `supply-chain` for package security

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `security` for comprehensive documentation.

## Environment Variables

### .env Files

```bash
# .env (never commit!)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
API_KEY=sk-xxx
JWT_SECRET=super-secret-key

# .env.example (commit this - no real values)
DATABASE_URL=postgresql://user:pass@host:5432/db
API_KEY=your-api-key-here
JWT_SECRET=generate-a-secure-secret
```

### .gitignore
```gitignore
# Secrets - ALWAYS ignore
.env
.env.local
.env.*.local
*.pem
*.key
credentials.json
secrets.yaml
```

### Loading in Code
```typescript
// Node.js with dotenv
import 'dotenv/config';
const apiKey = process.env.API_KEY;

// Validate required vars at startup
const required = ['DATABASE_URL', 'API_KEY', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}
```

## Secret Detection

### Pre-commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

### Scanning Commands
```bash
# Gitleaks - scan entire history
gitleaks detect --source . --verbose

# Scan only staged changes
gitleaks protect --staged

# TruffleHog
trufflehog git file://. --only-verified

# GitHub secret scanning (in repo settings)
# Enable "Secret scanning" and "Push protection"
```

## Secret Stores

### HashiCorp Vault
```typescript
import Vault from 'node-vault';

const vault = Vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

const { data } = await vault.read('secret/data/myapp');
const dbPassword = data.data.db_password;
```

### AWS Secrets Manager
```typescript
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManager({ region: 'us-east-1' });
const response = await client.getSecretValue({ SecretId: 'myapp/db' });
const secret = JSON.parse(response.SecretString!);
```

### Environment-based (Simpler)
```typescript
// For smaller projects, use encrypted env vars in CI/CD
// GitHub Actions, GitLab CI, etc. all support this

// GitHub Actions
// Settings > Secrets and variables > Actions > New secret
```

## CI/CD Secrets

### GitHub Actions
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          # Secrets available as env vars
          ./deploy.sh

      # NEVER do this:
      # - run: echo ${{ secrets.API_KEY }}
```

### Docker
```dockerfile
# Never bake secrets into images
# Wrong:
ENV API_KEY=secret

# Right: pass at runtime
# docker run -e API_KEY=$API_KEY myimage
```

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - DATABASE_URL  # From shell env
    env_file:
      - .env  # From file (not committed)
```

## Secret Rotation

### Policy
| Secret Type | Rotation Frequency |
|-------------|-------------------|
| API keys | 90 days |
| Database passwords | 90 days |
| JWT secrets | 180 days |
| Service accounts | 365 days |
| After compromise | Immediately |

### Rotation Process
1. Generate new secret
2. Update in secret store
3. Deploy new secret to services
4. Verify functionality
5. Revoke old secret
6. Update documentation

## Detecting Leaked Secrets

If a secret is leaked:
1. **Revoke immediately** - Don't wait
2. **Rotate** - Generate new credentials
3. **Audit** - Check for unauthorized access
4. **Clean history** - Use BFG or git-filter-repo
5. **Post-mortem** - Document and prevent recurrence

```bash
# Remove from git history (use BFG)
bfg --replace-text passwords.txt repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Security Checklist

- [ ] .env files in .gitignore
- [ ] .env.example with dummy values committed
- [ ] Pre-commit hooks for secret detection
- [ ] CI/CD secrets in encrypted store
- [ ] No secrets in Docker images
- [ ] Rotation policy defined
- [ ] Least privilege access
- [ ] GitHub secret scanning enabled

## Common Secret Patterns

```regex
# AWS
AKIA[0-9A-Z]{16}
aws_secret_access_key\s*=\s*.+

# GitHub
ghp_[a-zA-Z0-9]{36}
github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}

# Generic
password\s*=\s*.+
api[_-]?key\s*=\s*.+
secret\s*=\s*.+
token\s*=\s*.+
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Hardcoding API keys in code | Exposed in git history | Use .env + .gitignore |
| Committing .env to repo | Public credential exposure | Only commit .env.example |
| Using same secret everywhere | Single breach compromises all | Use unique secrets per environment |
| Never rotating secrets | Stale credentials vulnerable | Rotate every 90 days minimum |
| Logging full request/response | May contain auth tokens | Sanitize logs before writing |
| Storing secrets in frontend | Visible to all users | Backend only, pass via secure APIs |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| App can't find env var | .env not loaded or wrong name | Check dotenv is loaded, verify var name |
| Secret leaked in git | Committed before .gitignore | Use BFG to clean history, rotate secret |
| CI/CD can't access secrets | Not configured in platform | Add to GitHub Secrets/GitLab CI vars |
| Gitleaks blocking commit | Pre-commit hook found pattern | Verify it's false positive or fix |
| Vault connection fails | Wrong token or expired | Check VAULT_TOKEN and renewal |
| Different envs share secrets | Copy-paste .env between envs | Use separate .env.dev, .env.prod |

## Related Skills
- [OWASP Top 10](../owasp-top-10/SKILL.md)
- [GitHub Actions](../../ci-cd/github-actions/SKILL.md)
