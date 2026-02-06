# AI-Generated Code Security Skill

> **USE WHEN:** Reviewing AI-generated code (GitHub Copilot, ChatGPT, Claude, etc.) for security vulnerabilities, or establishing secure AI coding practices.
> **DO NOT USE FOR:** AI/ML model security, prompt injection attacks on AI systems, or general code review.

## AI Code Security Risks (2024-2025 Research)

### Key Statistics
- **45% of AI-generated code** contains security vulnerabilities (Stanford/NYU study)
- **40% of Copilot suggestions** include hardcoded credentials or insecure patterns
- **Package hallucinations** create supply chain risks (non-existent packages that could be typosquatted)
- **Outdated patterns**: AI trained on pre-2023 data may suggest deprecated/vulnerable APIs

## Common AI-Generated Vulnerabilities

### 1. Hardcoded Credentials

```typescript
// AI often generates this pattern
const API_KEY = 'sk-abc123...';  // Hardcoded!
const client = new ApiClient({ apiKey: API_KEY });

// Secure alternative
const client = new ApiClient({
  apiKey: process.env.API_KEY ?? throwError('API_KEY required')
});
```

### 2. SQL Injection

```typescript
// AI frequently suggests string interpolation
const query = `SELECT * FROM users WHERE id = ${userId}`;

// Secure alternative
const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

### 3. Weak Cryptography

```typescript
// AI often suggests deprecated algorithms
const hash = crypto.createHash('md5').update(password).digest('hex');

// Secure alternative
import argon2 from 'argon2';
const hash = await argon2.hash(password, { type: argon2.argon2id });
```

### 4. Missing Input Validation

```typescript
// AI-generated code often lacks validation
app.post('/users', (req, res) => {
  const user = createUser(req.body);  // No validation!
});

// Secure alternative
import { z } from 'zod';
const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

app.post('/users', (req, res) => {
  const validated = UserSchema.parse(req.body);
  const user = createUser(validated);
});
```

### 5. Insecure Randomness

```typescript
// AI often suggests Math.random()
const token = Math.random().toString(36);  // Predictable!

// Secure alternative
import { randomBytes } from 'crypto';
const token = randomBytes(32).toString('hex');
```

### 6. Path Traversal

```typescript
// AI often misses path validation
const filePath = path.join(__dirname, 'uploads', req.params.filename);
fs.readFile(filePath);  // ../../etc/passwd possible!

// Secure alternative
const safeName = path.basename(req.params.filename);  // Strip directory components
if (safeName !== req.params.filename || safeName.includes('..')) {
  throw new BadRequestError('Invalid filename');
}
const filePath = path.join(__dirname, 'uploads', safeName);
```

### 7. Package Hallucinations

```typescript
// AI may suggest non-existent packages
import { validate } from 'json-validator-pro';  // May not exist!

// Before using ANY AI-suggested package:
// 1. Verify it exists: npm view json-validator-pro
// 2. Check download stats: npmjs.com/package/json-validator-pro
// 3. Check for typosquatting: lodash vs lodesh
```

## AI Code Review Checklist

### Pre-Integration Review

| Check | Description | Tool |
|-------|-------------|------|
| **Secrets scan** | No hardcoded credentials | gitleaks, trufflehog |
| **Dependency exists** | All imports exist and are popular | npm view, pypi search |
| **OWASP Top 10** | No injection, XSS, CSRF, etc. | semgrep, eslint-plugin-security |
| **Crypto check** | Modern algorithms only | custom rules |
| **Input validation** | All external inputs validated | zod, joi, manual review |

### Package Verification Process

```bash
# Before adding AI-suggested packages:

# 1. Check if package exists
npm view <package-name>

# 2. Check popularity (downloads should be > 1000/week for production use)
npm info <package-name> downloads

# 3. Check for known vulnerabilities
npm audit <package-name>

# 4. Check repository activity
gh repo view <owner>/<repo> --web

# 5. Look for typosquatting variants
npm search <package-name>
```

## Secure AI Coding Workflow

### 1. Context Priming

When using AI assistants, include security context:

```
Generate a user authentication endpoint for Express.js that:
- Uses parameterized queries (not string interpolation)
- Validates all inputs with Zod
- Uses Argon2id for password hashing
- Implements rate limiting
- Returns generic error messages (no information disclosure)
- Uses environment variables for secrets
```

### 2. Security-First Prompts

```
Review this code for security issues:
- Check for OWASP Top 10 vulnerabilities
- Verify all inputs are validated
- Confirm no hardcoded secrets
- Check for secure random generation
- Verify proper error handling
```

### 3. Post-Generation Review

```bash
# Run automated security checks on AI-generated code
npm run lint:security
npx semgrep --config=p/security-audit <file>
npx gitleaks detect --source .
```

## Static Analysis Configuration

### ESLint Security Rules

```json
{
  "plugins": ["security", "no-secrets"],
  "extends": ["plugin:security/recommended"],
  "rules": {
    "security/detect-object-injection": "error",
    "security/detect-non-literal-regexp": "error",
    "security/detect-unsafe-regex": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-child-process": "warn",
    "security/detect-disable-mustache-escape": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-non-literal-require": "warn",
    "security/detect-possible-timing-attacks": "error",
    "security/detect-pseudoRandomBytes": "error",
    "no-secrets/no-secrets": "error"
  }
}
```

### Semgrep Rules for AI Code

```yaml
# .semgrep/ai-code-rules.yml
rules:
  - id: ai-hardcoded-secret
    patterns:
      - pattern-either:
          - pattern: $KEY = "sk-..."
          - pattern: $KEY = "api_..."
          - pattern: $KEY = "ghp_..."
    message: "Hardcoded secret detected (common in AI-generated code)"
    severity: ERROR

  - id: ai-weak-crypto
    patterns:
      - pattern-either:
          - pattern: crypto.createHash("md5")
          - pattern: crypto.createHash("sha1")
    message: "Weak hash algorithm (AI may suggest outdated crypto)"
    severity: ERROR

  - id: ai-sql-injection
    patterns:
      - pattern: $DB.query(`... ${$VAR} ...`)
    message: "String interpolation in SQL (common AI pattern)"
    severity: ERROR
```

## Language-Specific AI Code Risks

### TypeScript/JavaScript
- `eval()`, `new Function()` suggestions
- `innerHTML` without sanitization
- Missing `httpOnly` on cookies
- `Math.random()` for security tokens

### Python
- `pickle.loads()` on untrusted data
- `subprocess.call(shell=True)`
- `yaml.load()` without SafeLoader
- f-strings in SQL queries

### Java
- `Runtime.exec()` with string concat
- `ObjectInputStream` deserialization
- Regex DoS patterns
- Predictable `java.util.Random`

### Go
- Template injection with `text/template`
- Missing `defer rows.Close()`
- Unchecked errors

## CI/CD Integration

```yaml
name: AI Code Security Check
on: [pull_request]

jobs:
  ai-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect AI-generated code patterns
        run: |
          # Check for common AI code patterns
          npx semgrep --config=.semgrep/ai-code-rules.yml .

      - name: Verify all dependencies exist
        run: |
          # Extract all imports and verify they exist
          npm ls --all 2>&1 | grep -E "missing|UNMET" && exit 1 || true

      - name: Security scan
        run: npm audit --audit-level=high

      - name: Secrets scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          extra_args: --only-verified
```

## Team Guidelines

### AI Code Usage Policy

1. **Never commit without review**: All AI-generated code must be reviewed by a human
2. **Run security scans**: Mandatory before merging any AI-suggested code
3. **Verify packages**: Check all suggested dependencies exist and are legitimate
4. **Update AI context**: Include security requirements in prompts
5. **Track AI usage**: Document which code was AI-generated for audit purposes

### Code Review Focus Areas

When reviewing AI-generated PRs, prioritize:

1. **Authentication/Authorization** logic
2. **Input validation** at API boundaries
3. **Database queries** for injection
4. **File operations** for path traversal
5. **Cryptographic operations** for weak algorithms
6. **Third-party packages** for existence and security
7. **Error handling** for information disclosure
