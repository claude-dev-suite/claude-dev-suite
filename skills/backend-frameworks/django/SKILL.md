---
name: django
description: |
  Django batteries-included Python framework. Covers models, views,
  templates, ORM, and admin. Use when building full-featured Python
  web applications.

  USE WHEN: user mentions "django", "django orm", "django admin", "django templates",
  asks about "python cms", "django rest framework", "drf", "django models",
  "django migrations", "django channels", "django forms"

  DO NOT USE FOR: FastAPI projects - use `fastapi` instead, Flask projects - use `flask` instead,
  async-first Python APIs, microservices without admin panel
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Django Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Django Channels setup, WebSocket consumers, JWT authentication middleware, broadcasting from views, room management, and WebSocket testing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `django` for comprehensive documentation.

## Model Definition

```python
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
```

## Views (Class-Based)

```python
from django.views.generic import ListView, DetailView, CreateView
from django.urls import reverse_lazy

class UserListView(ListView):
    model = User
    template_name = 'users/list.html'
    context_object_name = 'users'
    paginate_by = 20

class UserDetailView(DetailView):
    model = User
    template_name = 'users/detail.html'

class UserCreateView(CreateView):
    model = User
    fields = ['name', 'email']
    success_url = reverse_lazy('user-list')
```

## Django REST Framework

```python
from rest_framework import viewsets, serializers

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'created_at']

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
```

## Key Commands

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Project Structure

```
myproject/
├── manage.py
├── myproject/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
└── users/
    ├── models.py
    ├── views.py
    ├── urls.py
    └── admin.py
```

## When NOT to Use This Skill

- **FastAPI projects** - FastAPI is async-first with automatic OpenAPI docs
- **Flask microservices** - Django is heavyweight for simple APIs
- **Non-Python backends** - Use language-appropriate frameworks
- **Real-time only apps** - Consider Node.js or Go for WebSocket-heavy apps
- **Serverless functions** - Django startup time is too slow

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| N+1 queries | Slow performance | Use `select_related()` and `prefetch_related()` |
| No index on frequently queried fields | Slow queries | Add `db_index=True` to model fields |
| Using `.filter()` in loops | Multiple DB hits | Use `.filter(id__in=list)` |
| Storing sensitive data in settings.py | Security risk | Use environment variables |
| Missing CSRF protection | XSS vulnerability | Keep `CsrfViewMiddleware` enabled |
| Fat models | Hard to test | Move business logic to services |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "No such table" error | Migrations not applied | Run `python manage.py migrate` |
| Static files not loading | STATIC_URL misconfigured | Run `collectstatic` in production |
| CSRF verification failed | Missing CSRF token | Add `{% csrf_token %}` to forms |
| "OperationalError: database is locked" | SQLite concurrency | Use PostgreSQL in production |
| Circular import errors | Models importing each other | Use `get_model()` or string references |
| Slow admin interface | No list_select_related | Add `list_select_related` to ModelAdmin |

## Production Readiness

### Security Configuration

```python
# settings/production.py
DEBUG = False
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')
SECRET_KEY = env('SECRET_KEY')

# Security headers
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# Session security
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
```

### Caching

```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': env('REDIS_URL'),
    }
}

# Usage
from django.views.decorators.cache import cache_page

@cache_page(60 * 15)  # 15 minutes
def my_view(request):
    ...
```

### Health Checks

```python
from django.http import JsonResponse
from django.db import connection

def health_check(request):
    return JsonResponse({'status': 'healthy'})

def ready_check(request):
    try:
        connection.ensure_connection()
        return JsonResponse({'status': 'ready', 'database': 'connected'})
    except Exception as e:
        return JsonResponse({'status': 'not ready', 'error': str(e)}, status=503)
```

### Gunicorn Configuration

```python
# gunicorn.conf.py
import multiprocessing

workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'uvicorn.workers.UvicornWorker'  # For async
bind = '0.0.0.0:8000'
max_requests = 1000
timeout = 30
```

### Testing

```python
import pytest
from django.test import Client

@pytest.fixture
def authenticated_client(django_user_model):
    user = django_user_model.objects.create_user(
        username='test', password='test123'
    )
    client = Client()
    client.force_login(user)
    return client

@pytest.mark.django_db
class TestUserAPI:
    def test_create_user(self, api_client):
        response = api_client.post('/api/users/', {
            'name': 'John', 'email': 'john@example.com'
        }, content_type='application/json')
        assert response.status_code == 201
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Response time (p99) | < 200ms |
| Error rate (5xx) | < 0.1% |
| Database connections | < pool size |
| Cache hit ratio | > 80% |

### Checklist

- [ ] DEBUG=False in production
- [ ] Security headers enabled
- [ ] HTTPS enforced (SSL redirect)
- [ ] Database connection pooling
- [ ] Redis caching configured
- [ ] Structured JSON logging
- [ ] Health/readiness endpoints
- [ ] Gunicorn with workers
- [ ] Static files on CDN
- [ ] pytest with fixtures

## Reference Documentation

- [Models & ORM](quick-ref/models.md)
- [Views Patterns](quick-ref/views.md)
