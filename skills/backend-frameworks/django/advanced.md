# Django Advanced Patterns

## Django Channels Setup

```python
# settings.py
INSTALLED_APPS = [
    'channels',
    'myapp',
]

ASGI_APPLICATION = 'myproject.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [os.environ.get('REDIS_URL', 'redis://localhost:6379')],
        },
    },
}
```

```python
# asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from myapp.routing import websocket_urlpatterns

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

---

## WebSocket Consumer

```python
# consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data['message']

        # Send to room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message': message,
                'user': self.scope['user'].username,
            }
        )

    async def chat_message(self, event):
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'message': event['message'],
            'user': event['user'],
        }))
```

---

## URL Routing

```python
# routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<room_name>\w+)/$', consumers.ChatConsumer.as_asgi()),
]
```

---

## JWT Authentication Middleware

```python
# middleware.py
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model

User = get_user_model()

@database_sync_to_async
def get_user(token_key):
    try:
        token = AccessToken(token_key)
        user_id = token.payload.get('user_id')
        return User.objects.get(id=user_id)
    except Exception:
        return AnonymousUser()

class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        params = dict(p.split('=') for p in query_string.split('&') if '=' in p)
        token = params.get('token')

        if token:
            scope['user'] = await get_user(token)
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)

# asgi.py
application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': JWTAuthMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})
```

---

## Protected Consumer

```python
class ProtectedConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope['user']

        if user.is_anonymous:
            await self.close(code=4001)
            return

        self.user = user
        await self.accept()

    async def receive(self, text_data):
        # self.user is available here
        pass
```

---

## Broadcasting from Views

```python
# views.py
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

def send_notification(request):
    channel_layer = get_channel_layer()

    # Send to specific group
    async_to_sync(channel_layer.group_send)(
        'notifications',
        {
            'type': 'notification_message',
            'message': 'New update available!',
        }
    )
    return JsonResponse({'status': 'sent'})

# Or async view
async def send_notification_async(request):
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        'notifications',
        {
            'type': 'notification_message',
            'message': 'New update available!',
        }
    )
    return JsonResponse({'status': 'sent'})
```

---

## Room Management Consumer

```python
class RoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.rooms = set()

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'join':
            room = data['room']
            await self.channel_layer.group_add(room, self.channel_name)
            self.rooms.add(room)
            await self.send(json.dumps({'action': 'joined', 'room': room}))

        elif action == 'leave':
            room = data['room']
            await self.channel_layer.group_discard(room, self.channel_name)
            self.rooms.discard(room)

        elif action == 'message':
            room = data['room']
            if room in self.rooms:
                await self.channel_layer.group_send(
                    room,
                    {'type': 'room_message', 'message': data['message']}
                )

    async def disconnect(self, close_code):
        for room in self.rooms:
            await self.channel_layer.group_discard(room, self.channel_name)

    async def room_message(self, event):
        await self.send(text_data=json.dumps(event))
```

---

## Testing WebSocket Consumers

```python
# tests.py
import pytest
from channels.testing import WebsocketCommunicator
from myproject.asgi import application

@pytest.mark.asyncio
async def test_chat_consumer():
    communicator = WebsocketCommunicator(
        application,
        '/ws/chat/testroom/'
    )
    connected, _ = await communicator.connect()
    assert connected

    # Send message
    await communicator.send_json_to({
        'message': 'Hello'
    })

    # Receive response
    response = await communicator.receive_json_from()
    assert response['message'] == 'Hello'

    await communicator.disconnect()
```
