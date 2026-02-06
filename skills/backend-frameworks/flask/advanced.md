# Flask - Advanced Patterns

## WebSocket Authentication

```python
from flask_socketio import disconnect
from functools import wraps
import jwt

def authenticated_only(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            disconnect()
            return
        return f(*args, **kwargs)
    return wrapped

@socketio.on('connect')
def handle_connect(auth):
    token = auth.get('token') if auth else None

    if not token:
        return False  # Reject connection

    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        # Store user in session
        session['user_id'] = payload['user_id']
    except jwt.InvalidTokenError:
        return False

@socketio.on('protected_event')
@authenticated_only
def handle_protected(data):
    user_id = session.get('user_id')
    emit('response', {'user': user_id, 'data': data})
```

## Room Management

```python
from flask_socketio import join_room, leave_room, rooms

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    emit('status', {'message': f'Joined room: {room}'}, to=room)

@socketio.on('leave')
def on_leave(data):
    room = data['room']
    leave_room(room)
    emit('status', {'message': f'Left room: {room}'}, to=room)

@socketio.on('room_message')
def on_room_message(data):
    room = data['room']
    message = data['message']
    emit('message', {'message': message}, to=room)

# Get current rooms for a client
@socketio.on('my_rooms')
def get_my_rooms():
    emit('rooms', {'rooms': list(rooms())})
```

## Namespace Pattern

```python
from flask_socketio import Namespace

class ChatNamespace(Namespace):
    def on_connect(self):
        print('Client connected to chat')

    def on_disconnect(self):
        print('Client disconnected from chat')

    def on_message(self, data):
        self.emit('message', data, broadcast=True)

    def on_join(self, data):
        join_room(data['room'])
        self.emit('joined', {'room': data['room']})

class NotificationsNamespace(Namespace):
    def on_connect(self):
        # Add to user-specific room
        user_id = session.get('user_id')
        if user_id:
            join_room(f'user_{user_id}')

    def on_disconnect(self):
        pass

socketio.on_namespace(ChatNamespace('/chat'))
socketio.on_namespace(NotificationsNamespace('/notifications'))
```

## Broadcasting from External Code

```python
from flask_socketio import SocketIO

# Initialize without app for use in other modules
socketio = SocketIO(message_queue='redis://localhost:6379')

def send_notification(user_id: str, message: dict):
    """Send notification from background task or different process"""
    socketio.emit(
        'notification',
        message,
        to=f'user_{user_id}',
        namespace='/notifications'
    )

def broadcast_announcement(message: str):
    """Broadcast to all connected clients"""
    socketio.emit('announcement', {'message': message})

# From Celery task or background job
@celery.task
def background_task(user_id):
    result = perform_heavy_computation()
    send_notification(user_id, {'type': 'task_complete', 'result': result})
```

## Error Handling

```python
from flask_socketio import ConnectionRefusedError

@socketio.on_error_default
def default_error_handler(e):
    print(f'Error: {e}')

@socketio.on_error('/chat')
def chat_error_handler(e):
    print(f'Chat error: {e}')
    emit('error', {'message': str(e)})

@socketio.on('connect')
def handle_connect():
    if not authorized():
        raise ConnectionRefusedError('Unauthorized')
```

## WebSocket Testing

```python
import pytest
from flask_socketio import SocketIOTestClient

@pytest.fixture
def socket_client(app):
    return socketio.test_client(app)

def test_connect(socket_client):
    assert socket_client.is_connected()

def test_message(socket_client):
    socket_client.emit('message', {'data': 'test'})
    received = socket_client.get_received()
    assert len(received) > 0
    assert received[0]['args'][0]['data'] == 'test'

def test_room(socket_client):
    socket_client.emit('join', {'room': 'test_room'})
    socket_client.emit('room_message', {'room': 'test_room', 'message': 'hello'})
    received = socket_client.get_received()
    assert any(r['name'] == 'message' for r in received)
```

## Production Deployment

```python
# With Gunicorn and eventlet
# gunicorn --worker-class eventlet -w 1 app:app

# With Gunicorn and gevent
# gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 app:app

# app.py
if __name__ == '__main__':
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False
    )
```

## Basic WebSocket Setup

```python
from flask import Flask
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Use Redis for scaling
socketio = SocketIO(
    app,
    cors_allowed_origins='*',
    message_queue='redis://localhost:6379'
)

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('message')
def handle_message(data):
    emit('message', data, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
```
