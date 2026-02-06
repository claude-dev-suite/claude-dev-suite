---
name: python-security
description: |
  Python security patterns for Django, FastAPI, and Flask. Covers Bandit, Safety,
  secure coding practices, and OWASP for Python ecosystem.

  USE WHEN: user works with "Python", "Django", "FastAPI", "Flask", asks about "Python vulnerabilities", "pip security", "Bandit", "Python injection", "Python authentication"

  DO NOT USE FOR: general OWASP concepts - use `owasp` or `owasp-top-10` instead, Node.js/Java security - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# Python Security - Quick Reference

## When NOT to Use This Skill
- **General OWASP concepts** - Use `owasp` or `owasp-top-10` skill
- **Node.js/TypeScript security** - Use base security skills
- **Java security** - Use `java-security` skill
- **Secrets management** - Use `secrets-management` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fastapi` or `django` for framework-specific security documentation.

## Dependency Auditing

```bash
# pip-audit - Official Python audit tool
pip-audit

# Safety - Check for known vulnerabilities
safety check

# pip-audit with requirements file
pip-audit -r requirements.txt

# Snyk for Python
snyk test

# Check outdated packages
pip list --outdated
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Security audit
  run: |
    pip install pip-audit safety
    pip-audit
    safety check
```

## Bandit - Static Analysis

```bash
# Run Bandit on project
bandit -r src/

# Generate JSON report
bandit -r src/ -f json -o bandit-report.json

# Skip specific tests
bandit -r src/ --skip B101,B601

# High severity only
bandit -r src/ -ll
```

### Bandit Configuration (.bandit)

```yaml
# .bandit
skips: ['B101']  # Skip assert warnings in tests
exclude_dirs: ['tests', 'venv']
```

### Common Bandit Warnings

| Code | Issue | Fix |
|------|-------|-----|
| B101 | assert used | Use proper validation in production |
| B105 | Hardcoded password | Use environment variables |
| B301 | Pickle usage | Use JSON or safer serialization |
| B601 | Shell injection | Use subprocess with list args |
| B608 | SQL injection | Use parameterized queries |

## SQL Injection Prevention

### SQLAlchemy - Safe

```python
# SAFE - Parameterized query
from sqlalchemy import text

result = db.execute(
    text("SELECT * FROM users WHERE email = :email"),
    {"email": email}
)

# SAFE - ORM query
user = db.query(User).filter(User.email == email).first()

# SAFE - FastAPI with SQLAlchemy
@app.get("/users/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    return db.query(User).filter(User.id == user_id).first()
```

### SQLAlchemy - UNSAFE

```python
# UNSAFE - String formatting
query = f"SELECT * FROM users WHERE email = '{email}'"  # NEVER!
db.execute(query)

# UNSAFE - % formatting
query = "SELECT * FROM users WHERE email = '%s'" % email  # NEVER!
```

### Django ORM - Safe

```python
# SAFE - ORM querysets
User.objects.filter(email=email)
User.objects.get(pk=user_id)

# SAFE - Raw query with params
User.objects.raw("SELECT * FROM users WHERE email = %s", [email])

# SAFE - Extra with params
User.objects.extra(where=["email = %s"], params=[email])
```

## XSS Prevention

### Django Templates (Auto-escaping)

```html
<!-- SAFE - Auto-escaped -->
{{ user_input }}

<!-- UNSAFE - Marked safe -->
{{ user_input|safe }}  <!-- Avoid if possible -->
```

### FastAPI/Jinja2

```python
# Configure auto-escaping
from jinja2 import Environment, select_autoescape

env = Environment(
    autoescape=select_autoescape(['html', 'xml'])
)
```

### Manual Sanitization

```python
# Use bleach for HTML sanitization
import bleach

clean_html = bleach.clean(
    user_input,
    tags=['p', 'b', 'i', 'a'],
    attributes={'a': ['href']},
    strip=True
)
```

## Authentication - FastAPI

### JWT with python-jose

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
```

### FastAPI OAuth2 Dependency

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user(username)
    if user is None:
        raise credentials_exception
    return user
```

## Authentication - Django

### Django Settings

```python
# settings.py
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
```

### Django Rate Limiting

```python
# Using django-ratelimit
from django_ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m', method='POST', block=True)
def login_view(request):
    # login logic
    pass
```

## Input Validation

### FastAPI with Pydantic

```python
from pydantic import BaseModel, EmailStr, Field, validator
import re

class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12, max_length=128)
    name: str = Field(..., min_length=2, max_length=100)

    @validator('password')
    def password_strength(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain lowercase')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain digit')
        if not re.search(r'[@$!%*?&]', v):
            raise ValueError('Password must contain special character')
        return v

    @validator('name')
    def name_alphanumeric(cls, v):
        if not re.match(r"^[a-zA-Z\s\-']+$", v):
            raise ValueError('Name contains invalid characters')
        return v
```

### Django Forms

```python
from django import forms
from django.core.validators import RegexValidator

class UserRegistrationForm(forms.Form):
    email = forms.EmailField(max_length=255)
    password = forms.CharField(
        min_length=12,
        max_length=128,
        widget=forms.PasswordInput
    )
    name = forms.CharField(
        min_length=2,
        max_length=100,
        validators=[RegexValidator(r"^[a-zA-Z\s\-']+$")]
    )
```

## Command Injection Prevention

```python
import subprocess
import shlex

# SAFE - Use list arguments
subprocess.run(["ls", "-la", directory], check=True)

# SAFE - Use shlex.split for shell-like parsing
subprocess.run(shlex.split(f"ls -la {shlex.quote(directory)}"), check=True)

# UNSAFE - shell=True with user input
subprocess.run(f"ls -la {directory}", shell=True)  # NEVER!

# UNSAFE - os.system
os.system(f"ls -la {directory}")  # NEVER!
```

## Secure File Upload

### FastAPI

```python
from fastapi import UploadFile, HTTPException
import uuid

ALLOWED_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB

@app.post("/upload")
async def upload_file(file: UploadFile):
    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "File type not allowed")

    # Read and check size
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "File too large")

    # Generate safe filename
    ext = Path(file.filename).suffix if file.filename else ""
    safe_name = f"{uuid.uuid4()}{ext}"

    # Store outside web root
    file_path = UPLOAD_DIR / safe_name
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(contents)

    return {"filename": safe_name}
```

## Secrets Management

```python
import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    api_key: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache
def get_settings():
    return Settings()

# Usage
settings = get_settings()
db_url = settings.database_url

# NEVER hardcode secrets
# JWT_SECRET = "hardcoded-secret"  # NEVER!
```

## Logging Security Events

```python
import logging
from datetime import datetime

logger = logging.getLogger("security")

def log_login_attempt(username: str, success: bool, ip: str):
    logger.info(
        "Login attempt",
        extra={
            "user": username,
            "success": success,
            "ip": ip,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

def log_access_denied(username: str, resource: str, ip: str):
    logger.warning(
        "Access denied",
        extra={
            "user": username,
            "resource": resource,
            "ip": ip
        }
    )

# NEVER log sensitive data
# logger.info(f"Password: {password}")  # NEVER!
# logger.info(f"Token: {token}")        # NEVER!
```

## CORS Configuration

### FastAPI

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com"],  # Not ["*"] in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### Django

```python
# settings.py with django-cors-headers
CORS_ALLOWED_ORIGINS = [
    "https://myapp.com",
]
CORS_ALLOW_CREDENTIALS = True
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `shell=True` in subprocess | Command injection | Use list arguments |
| f-string in SQL query | SQL injection | Use parameterized queries |
| `pickle.loads(user_data)` | Arbitrary code execution | Use JSON or validate source |
| `eval(user_input)` | Code injection | Never use eval on user input |
| Hardcoded secrets | Secret exposure | Use environment variables |
| `DEBUG=True` in production | Info disclosure | Set `DEBUG=False` |
| `{{user_input\|safe}}` | XSS vulnerability | Avoid unless sanitized |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Bandit B105 warning | Hardcoded password string | Move to environment variable |
| pip-audit finds CVE | Vulnerable package | Update to patched version |
| CORS error in browser | Origin not allowed | Add origin to allowed list |
| JWT decode fails | Wrong secret or expired | Check secret and expiration |
| Password hash mismatch | Different hashing algorithms | Use same context for hash/verify |
| Rate limit not working | Middleware order wrong | Add rate limiter before routes |

## Security Scanning Commands

```bash
# Static analysis
bandit -r src/

# Dependency audit
pip-audit
safety check

# All-in-one with Snyk
snyk test

# Check for secrets
gitleaks detect
trufflehog git file://.

# Django security check
python manage.py check --deploy
```

## Related Skills
- [OWASP Top 10:2025](../owasp-top-10/SKILL.md)
- [OWASP General](../owasp/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [Supply Chain Security](../supply-chain/SKILL.md)
