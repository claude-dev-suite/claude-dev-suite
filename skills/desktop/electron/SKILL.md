---
name: electron
description: |
  Electron framework for building cross-platform desktop applications
  with JavaScript, HTML, and CSS. Covers architecture, IPC, security,
  packaging, auto-updates, and backend integration patterns.

  USE WHEN: user mentions "Electron", "desktop app", "cross-platform application", asks about "IPC", "main process", "renderer process", "Electron packaging", "auto-updates", "code signing", "Electron security"

  DO NOT USE FOR: Tauri applications - use `tauri` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Electron Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `electron` for comprehensive API documentation.

## When NOT to Use This Skill

- **Tauri applications** - Use the `tauri` skill for Rust-based desktop apps
- **Web applications only** - Electron is for desktop apps, not web deployment
- **Mobile applications** - Electron doesn't support iOS/Android natively
- **CLI tools** - Use Node.js directly for command-line applications

---

## Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                           │
│  - Node.js Runtime (full access)                            │
│  - Electron APIs (app, BrowserWindow, ipcMain, dialog)      │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC Channel
┌──────────────────────────▼──────────────────────────────────┐
│                    Preload Script                           │
│  - Executes before renderer                                 │
│  - Uses contextBridge to expose safe APIs                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ contextBridge.exposeInMainWorld()
┌──────────────────────────▼──────────────────────────────────┐
│                   Renderer Process                          │
│  - Chromium Runtime (standard Web APIs)                     │
│  - No direct Node.js access (by default)                    │
│  - window.electronAPI (exposed via preload)                 │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

```
electron-app/
├── src/
│   ├── main/                    # Main process
│   │   ├── index.ts             # Entry point
│   │   ├── window.ts            # Window management
│   │   ├── ipc/                 # IPC handlers
│   │   └── updater.ts           # Auto-updates
│   ├── preload/
│   │   ├── index.ts             # Main preload
│   │   └── types.d.ts           # Type declarations
│   └── renderer/                # Frontend app
├── resources/                   # App icons
├── electron-builder.yml         # Packaging config
└── package.json
```

---

## IPC Communication Essentials

### Preload Script

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Event subscriptions
contextBridge.exposeInMainWorld('electronEvents', {
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_e: any, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
});
```

### Main Process Handlers

```typescript
// src/main/ipc/index.ts
import { ipcMain, dialog, app } from 'electron';

export function registerIpcHandlers() {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
}
```

> **Full Reference**: See [ipc-security.md](ipc-security.md) for complete IPC patterns and type-safe setup.

---

## Security Essentials

### Secure BrowserWindow

```typescript
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,      // REQUIRED
    nodeIntegration: false,      // REQUIRED
    sandbox: true,               // Recommended
    webSecurity: true,           // NEVER disable
  },
});

// Content Security Policy
win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "connect-src 'self' https://api.example.com",
      ].join('; '),
    },
  });
});
```

### Security Checklist

- [ ] `contextIsolation: true` - Isolate preload from renderer
- [ ] `nodeIntegration: false` - No Node.js APIs in renderer
- [ ] `sandbox: true` - OS-level process sandboxing
- [ ] Never expose raw `ipcRenderer` to renderer
- [ ] Validate ALL inputs in `ipcMain.handle()` handlers
- [ ] Use `safeStorage` API for credentials

> **Full Reference**: See [ipc-security.md](ipc-security.md) for complete security configuration.

---

## Packaging Quick Start

### Electron Builder (electron-builder.yml)

```yaml
appId: com.company.app
productName: My Application

mac:
  hardenedRuntime: true
  target: [dmg, zip]

win:
  target: [nsis, portable]

linux:
  target: [AppImage, deb]

publish:
  provider: github
  owner: company
  repo: app
```

### Auto-Updates

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    message: `Version ${info.version} available`,
    buttons: ['Download', 'Later'],
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

// Check on startup
autoUpdater.checkForUpdates();
```

> **Full Reference**: See [packaging.md](packaging.md) for complete Forge and Builder configuration.

---

## Backend Integration

### Local SQLite Database

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';

const db = new Database(path.join(app.getPath('userData'), 'app.db'));
db.pragma('journal_mode = WAL');

export const itemsRepo = {
  getAll: () => db.prepare('SELECT * FROM items').all(),
  create: (data) => db.prepare('INSERT INTO items (name) VALUES (?)').run(data.name),
};
```

### Secure Token Storage

```typescript
import { safeStorage } from 'electron';
import Store from 'electron-store';

const store = new Store({ name: 'auth' });

export const tokenStore = {
  setToken(token: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      store.set('accessToken', encrypted.toString('base64'));
    }
  },
  getToken(): string | null {
    const stored = store.get('accessToken') as string;
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  },
};
```

> **Full Reference**: See [backend.md](backend.md) for embedded servers, offline-first patterns, and WebSocket integration.

---

## Production Checklist

### Build & Packaging
- [ ] Code signing configured for all platforms
- [ ] macOS notarization enabled
- [ ] ASAR packaging enabled

### Security
- [ ] All security defaults enforced
- [ ] CSP headers configured
- [ ] IPC handlers validate all inputs
- [ ] safeStorage used for credentials

### Performance
- [ ] Startup time < 3 seconds
- [ ] Memory usage baseline established

### Monitoring Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Startup time | > 3s | > 5s |
| Memory usage | > 300MB | > 500MB |
| Crash rate | > 0.1% | > 1% |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| `nodeIntegration: true` | Major security risk | Use `contextIsolation: true` + preload |
| `webSecurity: false` | Enables XSS | Never disable |
| Exposing raw `ipcRenderer` | Security hole | Use `contextBridge.exposeInMainWorld()` |
| No input validation | Injection attacks | Validate in `ipcMain.handle()` |
| Hardcoded credentials | Exposed in ASAR | Use `safeStorage` API |
| `ipcRenderer.sendSync` | Blocks renderer | Use async `invoke()` |

---

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| `require is not defined` | Use preload with `contextBridge` |
| IPC returns `undefined` | Verify channel names match |
| White screen on startup | Check DevTools console |
| Auto-updater not checking | Ensure app is code-signed |
| High memory usage | Check for unbounded caches |
| App won't start on macOS | Complete notarization |

---

## Reference Files

| File | Content |
|------|---------|
| [ipc-security.md](ipc-security.md) | Type-safe IPC, Security configuration |
| [packaging.md](packaging.md) | Electron Forge, Builder, Auto-updates |
| [backend.md](backend.md) | SQLite, Express, Offline-first, WebSocket |

---

## External Documentation

- [Electron Official Docs](https://www.electronjs.org/docs/latest/)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge](https://www.electronforge.io/)
- [electron-builder](https://www.electron.build/)
