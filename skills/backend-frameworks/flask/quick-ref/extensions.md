# Flask Extensions

> **Knowledge Base:** Read `knowledge/flask/extensions.md` for complete documentation.

## Flask-SQLAlchemy

```python
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:pass@localhost/db'
    db.init_app(app)
    return app

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    posts = db.relationship('Post', backref='author', lazy='dynamic')

# Usage
users = User.query.filter_by(is_active=True).all()
db.session.add(user)
db.session.commit()
```

## Flask-Migrate

```python
from flask_migrate import Migrate

migrate = Migrate()

def create_app():
    app = Flask(__name__)
    db.init_app(app)
    migrate.init_app(app, db)
    return app

# CLI commands
# flask db init
# flask db migrate -m "Add users table"
# flask db upgrade
```

## Flask-JWT-Extended

```python
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity

jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config['JWT_SECRET_KEY'] = 'super-secret'
    jwt.init_app(app)
    return app

@app.route('/login', methods=['POST'])
def login():
    user = User.query.filter_by(email=request.json['email']).first()
    if user and user.check_password(request.json['password']):
        token = create_access_token(identity=user.id)
        return jsonify(access_token=token)
    return jsonify(error='Invalid credentials'), 401

@app.route('/profile')
@jwt_required()
def profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    return jsonify(user.to_dict())
```

## Flask-CORS

```python
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:3000"],
            "methods": ["GET", "POST", "PUT", "DELETE"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    return app
```

## Flask-Marshmallow

```python
from flask_marshmallow import Marshmallow

ma = Marshmallow()

class UserSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = User
        load_instance = True
        exclude = ('password',)

    posts = ma.Nested('PostSchema', many=True, exclude=('author',))

user_schema = UserSchema()
users_schema = UserSchema(many=True)

# Usage
user_schema.dump(user)  # Serialize
user_schema.load(data)  # Deserialize/validate
```

## Flask-Caching

```python
from flask_caching import Cache

cache = Cache(config={'CACHE_TYPE': 'redis', 'CACHE_REDIS_URL': 'redis://localhost:6379'})

@app.route('/users')
@cache.cached(timeout=300)
def get_users():
    return jsonify(User.query.all())

@cache.memoize(timeout=300)
def get_user(user_id):
    return User.query.get(user_id)
```

## Extension Pattern

```python
# extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

def init_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app)
```

**Official docs:** https://flask.palletsprojects.com/en/latest/extensions/
