# Angular Advanced Patterns

## WebSocket Service

```typescript
// websocket.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { Subject, Observable } from 'rxjs';

interface WebSocketMessage {
  type: string;
  payload: unknown;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  private messagesSubject = new Subject<WebSocketMessage>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Signals for reactive state
  isConnected = signal(false);
  connectionError = signal<string | null>(null);

  messages$ = this.messagesSubject.asObservable();

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
      this.connectionError.set(null);
      this.reconnectAttempts = 0;
    };

    this.ws.onclose = () => {
      this.isConnected.set(false);
      this.reconnect(url);
    };

    this.ws.onerror = () => {
      this.connectionError.set('Connection error');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messagesSubject.next(data);
    };
  }

  private reconnect(url: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(url), 3000);
    }
  }

  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.ws?.close();
  }

  // Filter messages by type
  on<T>(type: string): Observable<T> {
    return new Observable((subscriber) => {
      const subscription = this.messages$.subscribe((message) => {
        if (message.type === type) {
          subscriber.next(message.payload as T);
        }
      });
      return () => subscription.unsubscribe();
    });
  }
}
```

---

## Usage in Component

```typescript
// chat.component.ts
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { Subscription } from 'rxjs';

interface Message {
  id: string;
  content: string;
  user: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `
    <div class="chat">
      <div class="status" [class.connected]="ws.isConnected()">
        {{ ws.isConnected() ? 'Connected' : 'Disconnected' }}
      </div>

      <div class="messages">
        @for (message of messages(); track message.id) {
          <div class="message">
            <strong>{{ message.user }}:</strong> {{ message.content }}
          </div>
        }
      </div>

      <form (ngSubmit)="sendMessage()">
        <input
          [(ngModel)]="newMessage"
          [disabled]="!ws.isConnected()"
          placeholder="Type a message..."
        />
        <button type="submit" [disabled]="!ws.isConnected()">Send</button>
      </form>
    </div>
  `,
})
export class ChatComponent implements OnInit, OnDestroy {
  ws = inject(WebSocketService);

  messages = signal<Message[]>([]);
  newMessage = '';

  private subscription?: Subscription;

  ngOnInit(): void {
    this.ws.connect('wss://api.example.com/ws');

    this.subscription = this.ws.on<Message>('message').subscribe((message) => {
      this.messages.update((msgs) => [...msgs, message]);
    });
  }

  sendMessage(): void {
    if (this.newMessage.trim()) {
      this.ws.send({
        type: 'message',
        payload: { content: this.newMessage },
      });
      this.newMessage = '';
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.ws.disconnect();
  }
}
```

---

## With RxJS Operators

```typescript
// websocket-rx.service.ts
import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { retry, share, filter, map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebSocketRxService {
  private socket$: WebSocketSubject<any> | null = null;

  connect(url: string): Observable<any> {
    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket({
        url,
        openObserver: {
          next: () => console.log('WebSocket connected'),
        },
        closeObserver: {
          next: () => console.log('WebSocket closed'),
        },
      });
    }

    return this.socket$.pipe(
      retry({ delay: 3000, count: 5 }),
      share()
    );
  }

  send(message: any): void {
    this.socket$?.next(message);
  }

  on<T>(type: string): Observable<T> {
    return this.socket$!.pipe(
      filter((msg) => msg.type === type),
      map((msg) => msg.payload as T)
    );
  }

  close(): void {
    this.socket$?.complete();
  }
}
```

---

## Socket.IO Integration

```typescript
// socketio.service.ts
import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketIOService {
  private socket: Socket | null = null;

  isConnected = signal(false);

  connect(url: string, token?: string): void {
    this.socket = io(url, {
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.isConnected.set(true);
    });

    this.socket.on('disconnect', () => {
      this.isConnected.set(false);
    });
  }

  emit(event: string, data: any): void {
    this.socket?.emit(event, data);
  }

  on<T>(event: string): Observable<T> {
    return new Observable((subscriber) => {
      this.socket?.on(event, (data: T) => {
        subscriber.next(data);
      });

      return () => {
        this.socket?.off(event);
      };
    });
  }

  joinRoom(roomId: string): void {
    this.emit('join', { room: roomId });
  }

  leaveRoom(roomId: string): void {
    this.emit('leave', { room: roomId });
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
```

---

## Room Management with Signals

```typescript
// room.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { WebSocketService } from './websocket.service';

interface RoomState {
  users: string[];
  messages: Message[];
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private ws = inject(WebSocketService);

  private roomState = signal<Map<string, RoomState>>(new Map());

  constructor() {
    this.ws.on<any>('user_joined').subscribe((data) => {
      this.roomState.update((state) => {
        const room = state.get(data.room) || { users: [], messages: [] };
        room.users = [...room.users, data.user];
        return new Map(state.set(data.room, room));
      });
    });

    this.ws.on<any>('message').subscribe((data) => {
      this.roomState.update((state) => {
        const room = state.get(data.room) || { users: [], messages: [] };
        room.messages = [...room.messages, data];
        return new Map(state.set(data.room, room));
      });
    });
  }

  joinRoom(roomId: string): void {
    this.ws.send({ type: 'join', payload: { room: roomId } });
  }

  leaveRoom(roomId: string): void {
    this.ws.send({ type: 'leave', payload: { room: roomId } });
  }

  getRoomUsers(roomId: string) {
    return computed(() => this.roomState().get(roomId)?.users || []);
  }

  getRoomMessages(roomId: string) {
    return computed(() => this.roomState().get(roomId)?.messages || []);
  }
}
```
