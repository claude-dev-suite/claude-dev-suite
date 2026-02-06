---
name: nestjs-websocket
description: |
  WebSocket integration for NestJS using Socket.IO. Covers gateways, rooms,
  authentication guards, exception filters, and Redis adapter for scaling.

  USE WHEN: user mentions "NestJS WebSocket", "NestJS gateway", "Socket.IO NestJS",
  "real-time NestJS", "NestJS chat", "WebSocket authentication NestJS",
  asks about "how to implement WebSocket in NestJS"

  DO NOT USE FOR: React WebSocket hooks - use `react-websocket` instead,
  Spring WebSocket - use `spring-websocket` instead,
  raw Node.js WebSocket - use `nodejs` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# NestJS WebSocket Integration

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nestjs` for comprehensive documentation.

## Gateway Setup

```ts
// events.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || [],
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string; data: any },
  ) {
    this.server.to(payload.room).emit('message', payload.data);
    return { event: 'message', data: 'Message sent' };
  }
}
```

## Module Registration

```ts
// events.module.ts
import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}

// app.module.ts
@Module({
  imports: [EventsModule],
})
export class AppModule {}
```

## Authentication Guard

```ts
// ws-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token ||
                  client.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      throw new WsException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}

// Usage in gateway
@UseGuards(WsAuthGuard)
@SubscribeMessage('protected-event')
handleProtectedEvent(@ConnectedSocket() client: Socket) {
  const user = client.data.user;
  return { user };
}
```

## Room Management

```ts
@WebSocketGateway()
export class RoomsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.join(roomId);
    client.to(roomId).emit('user-joined', { id: client.id });
    return { event: 'joined', room: roomId };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.leave(roomId);
    client.to(roomId).emit('user-left', { id: client.id });
  }

  // Broadcast to room from service
  broadcastToRoom(roomId: string, event: string, data: any) {
    this.server.to(roomId).emit(event, data);
  }

  // Get clients in room
  async getClientsInRoom(roomId: string): Promise<string[]> {
    const sockets = await this.server.in(roomId).fetchSockets();
    return sockets.map((s) => s.id);
  }
}
```

## Exception Handling

```ts
// ws-exception.filter.ts
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();

    const error = exception instanceof WsException
      ? exception.getError()
      : { message: 'Internal server error' };

    client.emit('error', {
      status: 'error',
      message: typeof error === 'string' ? error : (error as any).message,
    });
  }
}

// Apply globally or per gateway
@UseFilters(new WsExceptionFilter())
@WebSocketGateway()
export class EventsGateway {}
```

## Scaling with Redis Adapter

```ts
// main.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}

// Bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(3000);
}
```

## Event Listeners

```ts
@Component
@RequiredArgsConstructor
@Slf4j
export class WebSocketEventListener {
  constructor(private messagingTemplate: SimpMessagingTemplate) {}

  @EventListener
  handleWebSocketConnectListener(event: SessionConnectedEvent) {
    log.info('New WebSocket connection established');
  }

  @EventListener
  handleWebSocketDisconnectListener(event: SessionDisconnectEvent) {
    const headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
    const username = headerAccessor.getSessionAttributes().get('username');

    if (username != null) {
      log.info(`User disconnected: ${username}`);
      const leaveMessage = ChatMessage.builder()
        .type(ChatMessage.MessageType.LEAVE)
        .sender(username)
        .build();
      messagingTemplate.convertAndSend('/topic/public', leaveMessage);
    }
  }
}
```

## Injecting Gateway into Services

```ts
// notifications.service.ts
@Injectable()
export class NotificationsService {
  constructor(private eventsGateway: EventsGateway) {}

  async notifyUser(userId: string, notification: Notification) {
    this.eventsGateway.server
      .to(`user:${userId}`)
      .emit('notification', notification);
  }

  async broadcastAnnouncement(message: string) {
    this.eventsGateway.server.emit('announcement', { message });
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why Bad | Correct Approach |
|--------------|---------|------------------|
| Not using namespaces | All events mixed together | Use namespaces for separation |
| Missing auth on connect | Unauthorized access | Implement WsAuthGuard |
| No room cleanup | Memory leaks | Handle disconnect events |
| Sync heavy operations in handlers | Blocks event loop | Use async/await properly |
| Missing Redis adapter in prod | Can't scale horizontally | Use Redis adapter |

## Quick Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| CORS errors | Missing CORS config | Add cors option to gateway |
| Auth always fails | Token not in handshake | Check client auth setup |
| Messages not received | Wrong namespace | Verify namespace matches |
| Room broadcasts fail | Client not in room | Verify join-room called |
| Scaling issues | No Redis adapter | Implement RedisIoAdapter |

## Production Checklist

- [ ] CORS properly configured
- [ ] JWT authentication guard
- [ ] Redis adapter for horizontal scaling
- [ ] Exception filter for error handling
- [ ] Proper disconnect handling
- [ ] Rate limiting on messages
- [ ] Heartbeat/ping configured
- [ ] Logging for connections/disconnections

## When NOT to Use This Skill

- For React WebSocket client → use `react-websocket`
- For Spring WebSocket → use `spring-websocket`
- For raw HTTP long-polling → use standard controllers

## Reference Documentation
- [NestJS Core](../nestjs/SKILL.md)
- [JWT Authentication](../../authentication/jwt/SKILL.md)
