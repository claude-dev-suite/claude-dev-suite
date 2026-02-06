# FastAPI Advanced Patterns

## WebSocket Basic Setup

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Message: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

---

## WebSocket Authentication

```python
from fastapi import WebSocket, WebSocketDisconnect, Query, status
from jose import jwt, JWTError

async def get_current_user_ws(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None
        return await get_user(user_id)
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    user = await get_current_user_ws(websocket, token)
    if not user:
        return

    await manager.connect(websocket, user.id)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, user, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id)
```

---

## Room Management

```python
from collections import defaultdict
from typing import Dict, Set

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.user_rooms: Dict[WebSocket, Set[str]] = defaultdict(set)

    async def join_room(self, websocket: WebSocket, room_id: str):
        self.rooms[room_id].add(websocket)
        self.user_rooms[websocket].add(room_id)
        await self.broadcast_to_room(
            room_id,
            {"type": "user_joined", "room": room_id},
            exclude=websocket
        )

    async def leave_room(self, websocket: WebSocket, room_id: str):
        self.rooms[room_id].discard(websocket)
        self.user_rooms[websocket].discard(room_id)
        if not self.rooms[room_id]:
            del self.rooms[room_id]

    async def broadcast_to_room(
        self,
        room_id: str,
        message: dict,
        exclude: WebSocket = None
    ):
        for connection in self.rooms.get(room_id, []):
            if connection != exclude:
                await connection.send_json(message)

    def disconnect(self, websocket: WebSocket):
        for room_id in list(self.user_rooms.get(websocket, [])):
            self.rooms[room_id].discard(websocket)
        self.user_rooms.pop(websocket, None)

room_manager = RoomManager()
```

---

## Message Protocol with Pydantic

```python
from pydantic import BaseModel
from enum import Enum
from typing import Any

class MessageType(str, Enum):
    JOIN = "join"
    LEAVE = "leave"
    MESSAGE = "message"
    PING = "ping"

class WSMessage(BaseModel):
    type: MessageType
    payload: Any
    timestamp: float

async def handle_message(websocket: WebSocket, user: User, data: dict):
    try:
        message = WSMessage(**data)
    except ValidationError as e:
        await websocket.send_json({"type": "error", "payload": str(e)})
        return

    match message.type:
        case MessageType.JOIN:
            await room_manager.join_room(websocket, message.payload)
        case MessageType.LEAVE:
            await room_manager.leave_room(websocket, message.payload)
        case MessageType.MESSAGE:
            await room_manager.broadcast_to_room(
                message.payload["room"],
                {"type": "message", "user": user.name, "data": message.payload["data"]}
            )
        case MessageType.PING:
            await websocket.send_json({"type": "pong", "timestamp": time.time()})
```

---

## Heartbeat & Connection Health

```python
import asyncio

HEARTBEAT_INTERVAL = 30

async def heartbeat(websocket: WebSocket):
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await websocket.send_json({"type": "ping"})
        except Exception:
            break

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    heartbeat_task = asyncio.create_task(heartbeat(websocket))

    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, data)
    except WebSocketDisconnect:
        heartbeat_task.cancel()
        manager.disconnect(websocket)
```

---

## Scaling with Redis Pub/Sub

```python
import aioredis
import json

class RedisPubSubManager:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.pubsub = None

    async def connect(self):
        self.redis = await aioredis.from_url(self.redis_url)
        self.pubsub = self.redis.pubsub()

    async def subscribe(self, channel: str):
        await self.pubsub.subscribe(channel)

    async def publish(self, channel: str, message: dict):
        await self.redis.publish(channel, json.dumps(message))

    async def listen(self):
        async for message in self.pubsub.listen():
            if message["type"] == "message":
                yield json.loads(message["data"])

redis_manager = RedisPubSubManager(os.getenv("REDIS_URL"))

@app.on_event("startup")
async def startup():
    await redis_manager.connect()
    await redis_manager.subscribe("ws:broadcast")

    async def broadcast_from_redis():
        async for message in redis_manager.listen():
            await manager.broadcast(json.dumps(message))

    asyncio.create_task(broadcast_from_redis())
```

---

## Background Tasks with WebSocket

```python
from fastapi import BackgroundTasks

async def process_heavy_task(websocket: WebSocket, task_id: str):
    # Long running task
    result = await heavy_computation()
    await websocket.send_json({
        "type": "task_complete",
        "task_id": task_id,
        "result": result
    })

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "start_task":
                asyncio.create_task(
                    process_heavy_task(websocket, data["task_id"])
                )
    except WebSocketDisconnect:
        pass
```
