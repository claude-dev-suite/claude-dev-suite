# Flask Blueprints

> **Knowledge Base:** Read `knowledge/flask/blueprints.md` for complete documentation.

## Basic Blueprint

```python
# blueprints/users.py
from flask import Blueprint, jsonify, request

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

@users_bp.route('/', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@users_bp.route('/', methods=['POST'])
def create_user():
    data = request.get_json()
    user = User(**data)
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201
```

## Register Blueprint

```python
# app.py
from flask import Flask
from blueprints.users import users_bp
from blueprints.posts import posts_bp
from blueprints.auth import auth_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    # Register blueprints
    app.register_blueprint(users_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')

    return app
```

## Blueprint with Templates

```python
# blueprints/admin/__init__.py
from flask import Blueprint

admin_bp = Blueprint(
    'admin',
    __name__,
    url_prefix='/admin',
    template_folder='templates',  # blueprints/admin/templates/
    static_folder='static'        # blueprints/admin/static/
)

from . import routes
```

## Blueprint Hooks

```python
@users_bp.before_request
def before_request():
    # Runs before each request to this blueprint
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

@users_bp.after_request
def after_request(response):
    # Runs after each request
    response.headers['X-Custom-Header'] = 'value'
    return response

@users_bp.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404
```

## Nested Blueprints

```python
# blueprints/api/__init__.py
from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api')

# Sub-blueprints
from .v1 import v1_bp
from .v2 import v2_bp

api_bp.register_blueprint(v1_bp)
api_bp.register_blueprint(v2_bp)
```

## Project Structure

```
myapp/
├── app.py
├── config.py
├── blueprints/
│   ├── __init__.py
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   └── templates/
│   ├── users/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   └── models.py
│   └── api/
│       ├── __init__.py
│       ├── v1/
│       └── v2/
├── models/
├── templates/
└── static/
```

## URL Building

```python
from flask import url_for

# Build URLs for blueprint routes
url_for('users.get_users')  # /api/users/
url_for('users.get_user', user_id=1)  # /api/users/1
url_for('admin.dashboard')  # /admin/dashboard
```

**Official docs:** https://flask.palletsprojects.com/en/latest/blueprints/
