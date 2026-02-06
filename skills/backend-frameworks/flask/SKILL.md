---
name: flask
description: |
  Flask lightweight Python framework. Covers routing, blueprints,
  and extensions. Use for simple Python APIs and microservices.

  USE WHEN: user mentions "flask", "flask blueprints", "python microservice",
  asks about "flask-restful", "flask extensions", "lightweight python api",
  "flask-sqlalchemy", "flask-jwt", "flask middleware"

  DO NOT USE FOR: Django projects - use `django` instead, FastAPI with type validation - use `fastapi` instead,
  async-first APIs, applications requiring built-in admin panel
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Flask Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Flask-SocketIO WebSocket patterns, authentication, room management, namespaces, and broadcasting from external code.

## Basic Setup

```python
from flask import Flask, jsonify, request, abort

app = Flask(__name__)

@app.route('/users', methods=['GET'])
def get_users():
    return jsonify(users)

@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = find_user(user_id)
    if not user:
        abort(404)
    return jsonify(user)

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    user = create_user_in_db(data)
    return jsonify(user), 201
```

## Blueprints

```python
from flask import Blueprint

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

@users_bp.route('/')
def list_users():
    return jsonify(get_all_users())

# In app.py
app.register_blueprint(users_bp)
```

## Key Extensions

| Extension | Purpose |
|-----------|---------|
| Flask-SQLAlchemy | Database ORM |
| Flask-Migrate | Database migrations |
| Flask-JWT-Extended | JWT auth |
| Flask-CORS | CORS support |
| Flask-RESTful | REST APIs |

## Application Factory

```python
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()

def create_app(config_name='production'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    db.init_app(app)
    CORS(app, origins=app.config['CORS_ORIGINS'])

    from .routes import users_bp, health_bp
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(health_bp)

    register_error_handlers(app)
    return app
```

## Configuration

```python
import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }

class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
```

## Error Handling

```python
from flask import jsonify

class APIError(Exception):
    def __init__(self, message, status_code=400):
        self.message = message
        self.status_code = status_code

def register_error_handlers(app):
    @app.errorhandler(APIError)
    def handle_api_error(error):
        return jsonify({'error': error.message}), error.status_code

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Resource not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error'}), 500
```

## Health Checks

```python
health_bp = Blueprint('health', __name__)

@health_bp.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@health_bp.route('/ready')
def ready():
    try:
        db.engine.execute('SELECT 1')
        return jsonify({'status': 'ready', 'database': 'connected'})
    except Exception as e:
        return jsonify({'status': 'not ready'}), 503
```

## Testing

```python
import pytest
from app import create_app, db

@pytest.fixture
def app():
    app = create_app('testing')
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

def test_create_user(client):
    response = client.post('/api/users/', json={
        'name': 'John', 'email': 'john@example.com'
    })
    assert response.status_code == 201
```

## When NOT to Use This Skill

- **Django projects** - Django provides more batteries-included features
- **FastAPI with type validation** - FastAPI has built-in Pydantic validation
- **Async-first applications** - Flask is sync-based
- **Built-in admin required** - Django admin is more comprehensive

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using global app instance | Hard to test | Use application factory pattern |
| No error handlers | Generic 500 errors | Register error handlers |
| Hardcoded config values | Can't change per environment | Use `app.config.from_object()` |
| Not using blueprints | Monolithic code | Split into blueprints |
| Missing CORS | Frontend can't connect | Use `flask-cors` extension |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "Working outside application context" | No app context | Use `with app.app_context():` |
| Static files 404 | Wrong path | Check `static_folder` |
| CORS errors | Not configured | Install and configure `flask-cors` |
| Database pool exhausted | No pooling | Configure `SQLALCHEMY_ENGINE_OPTIONS` |
| Blueprint not found | Not registered | Call `app.register_blueprint()` |

## Production Checklist

- [ ] Application factory pattern
- [ ] Environment-based config
- [ ] Structured JSON logging
- [ ] Request ID tracing
- [ ] Database connection pooling
- [ ] Health/readiness endpoints
- [ ] Global error handlers
- [ ] Gunicorn with workers
- [ ] pytest fixtures for testing
- [ ] CORS properly configured

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Response time (p99) | < 200ms |
| Error rate (5xx) | < 0.1% |
| Database pool usage | < 80% |

## Reference Documentation
- [Blueprints](quick-ref/blueprints.md)
- [Extensions](quick-ref/extensions.md)
