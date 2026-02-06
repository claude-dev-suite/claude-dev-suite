# Backend Integration Patterns

## Pattern 1: Embedded Express Server

```typescript
// src/main/backend/server.ts
import express, { Express } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { app as electronApp } from 'electron';

let server: Server | null = null;
let serverPort: number = 0;

export async function startEmbeddedServer(): Promise<number> {
  const app: Express = express();

  app.use(cors({ origin: 'file://' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: electronApp.getVersion() });
  });

  app.get('/api/data', async (req, res) => {
    const data = await getDataFromDatabase();
    res.json(data);
  });

  return new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (typeof address === 'object' && address) {
        serverPort = address.port;
        console.log(`Embedded server running on port ${serverPort}`);
        resolve(serverPort);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
  });
}

export function stopEmbeddedServer(): void {
  server?.close();
}
```

---

## Pattern 2: Local SQLite Database

```typescript
// src/main/database/index.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'app.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations();
  return db;
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
  const appliedSet = new Set(applied.map(m => m.name));

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (!appliedSet.has(file)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    }
  }
}

// Repository pattern
export const itemsRepo = {
  getAll(): Item[] {
    return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
  },
  getById(id: number): Item | undefined {
    return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  },
  create(data: Omit<Item, 'id'>): Item {
    const stmt = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
    const result = stmt.run(data.name, data.description);
    return this.getById(result.lastInsertRowid as number)!;
  },
  delete(id: number): boolean {
    return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
  },
};
```

---

## Pattern 3: External API Communication

```typescript
// src/preload/api.ts
import { contextBridge } from 'electron';

const API_BASE_URL = process.env.API_URL || 'https://api.example.com';

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

contextBridge.exposeInMainWorld('api', {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, data: unknown) => apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  put: <T>(endpoint: string, data: unknown) => apiRequest<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
});
```

---

## Pattern 4: Offline-First with Sync

```typescript
// src/renderer/services/sync-manager.ts
interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entity: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

class SyncManager {
  private queue: SyncQueueItem[] = [];
  private isOnline = navigator.onLine;
  private isSyncing = false;

  constructor() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    this.loadQueue();
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.processQueue();
  }

  async enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    this.queue.push({
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    });
    await this.saveQueue();
    if (this.isOnline) this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isSyncing || this.queue.length === 0) return;
    this.isSyncing = true;

    while (this.queue.length > 0 && this.isOnline) {
      const item = this.queue[0];
      try {
        await this.syncItem(item);
        this.queue.shift();
        await this.saveQueue();
      } catch {
        item.retries++;
        if (item.retries >= 3) this.queue.shift();
        break;
      }
    }

    this.isSyncing = false;
  }
}

export const syncManager = new SyncManager();
```

---

## Pattern 5: Secure Token Storage

```typescript
// src/main/auth/token-store.ts
import { safeStorage } from 'electron';
import Store from 'electron-store';

const store = new Store({ name: 'auth' });

export const tokenStore = {
  setToken(token: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      store.set('accessToken', encrypted.toString('base64'));
    } else {
      store.set('accessToken', token);
    }
  },

  getToken(): string | null {
    const stored = store.get('accessToken') as string | undefined;
    if (!stored) return null;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return stored;
  },

  clearToken(): void {
    store.delete('accessToken');
  },
};

// IPC handlers
ipcMain.handle('auth:getToken', () => tokenStore.getToken());
ipcMain.handle('auth:setToken', (_event, token: string) => tokenStore.setToken(token));
ipcMain.handle('auth:clearToken', () => tokenStore.clearToken());
```

---

## WebSocket Integration

```typescript
// src/preload/websocket.ts
import { contextBridge, ipcRenderer } from 'electron';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private handlers = new Map<string, Set<(data: unknown) => void>>();

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      ipcRenderer.send('ws:connected');
    };

    this.ws.onclose = () => {
      ipcRenderer.send('ws:disconnected');
      this.attemptReconnect(url);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handlers.get(message.type)?.forEach(h => h(message.data));
    };
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(url), delay);
    }
  }

  subscribe(type: string, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
}

const wsManager = new WebSocketManager();

contextBridge.exposeInMainWorld('websocket', {
  connect: (url: string) => wsManager.connect(url),
  disconnect: () => wsManager.disconnect(),
  subscribe: (type: string, handler: (data: unknown) => void) => wsManager.subscribe(type, handler),
  send: (type: string, data: unknown) => wsManager.send(type, data),
});
```
