---
name: tauri
description: |
  Tauri framework for building cross-platform desktop applications
  with Rust backend and web frontend. Covers architecture, IPC commands,
  plugins, bundling, code signing, and security best practices.

  USE WHEN: user mentions "Tauri", "Rust desktop app", asks about "Tauri commands", "Tauri plugins", "Tauri IPC", "Rust + Svelte/React", "lightweight desktop app", "Tauri bundling", "Tauri security"

  DO NOT USE FOR: Electron applications - use `electron` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Tauri Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for event system, plugins (Dialog, Filesystem, Store), bundling configuration, code signing, testing patterns, and input validation.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tauri` for comprehensive API documentation.

## When NOT to Use This Skill

- **Electron applications** - Use the `electron` skill
- **Pure Rust applications** - Use Rust skill for CLI or backend-only
- **Web-only deployments** - Tauri is for desktop apps
- **Mobile apps** - Tauri Mobile is in alpha
- **Applications requiring Node.js ecosystem** - Use Electron

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Rust Backend                            │
│  • Tauri Runtime (window management, events, plugins)       │
│  • Custom Commands (#[tauri::command])                      │
│  • State Management (tauri::State with Mutex/RwLock)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (invoke / events)
┌──────────────────────────▼──────────────────────────────────┐
│                   System WebView                             │
│  • Web APIs (DOM, CSS, JavaScript) - No Node.js             │
│  • @tauri-apps/api (type-safe IPC)                          │
│  • Frontend Framework (Svelte/React/Vue)                    │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure
```
tauri-app/
├── src/                        # Frontend source
│   └── routes/
├── src-tauri/                  # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/           # Permissions
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── package.json
└── vite.config.ts
```

## Configuration

### tauri.conf.json
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "My App",
  "version": "1.0.0",
  "identifier": "com.company.myapp",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../build"
  },
  "app": {
    "windows": [{
      "title": "My App",
      "width": 1200,
      "height": 800,
      "center": true
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'"
    }
  }
}
```

---

## IPC Communication

### Basic Command
```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';

const message = await invoke<string>('greet', { name: 'World' });
```

### Async Command with Error Handling
```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct User {
    id: u32,
    name: String,
    email: String,
}

#[tauri::command]
async fn get_user(id: u32) -> Result<User, CommandError> {
    if id == 0 {
        return Err(CommandError {
            code: "NOT_FOUND".to_string(),
            message: "User not found".to_string(),
        });
    }

    Ok(User {
        id,
        name: "Alice".to_string(),
        email: "alice@example.com".to_string(),
    })
}
```

```typescript
interface CommandError {
  code: string;
  message: string;
}

try {
  const user = await invoke<User>('get_user', { id: 1 });
} catch (error) {
  const err = error as CommandError;
  console.error(`[${err.code}] ${err.message}`);
}
```

### State Management
```rust
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub counter: Mutex<i32>,
}

#[tauri::command]
fn get_count(state: State<AppState>) -> i32 {
    *state.counter.lock().unwrap()
}

#[tauri::command]
fn increment(state: State<AppState>) -> i32 {
    let mut counter = state.counter.lock().unwrap();
    *counter += 1;
    *counter
}

// In main
tauri::Builder::default()
    .manage(AppState { counter: Mutex::new(0) })
    .invoke_handler(tauri::generate_handler![get_count, increment])
```

---

## Security

### Capability-Based Permissions
```json
// src-tauri/capabilities/default.json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    {
      "identifier": "fs:scope",
      "allow": ["$APPDATA/**", "$DOCUMENT/**"]
    },
    "store:default"
  ]
}
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| No input validation in commands | Vulnerable to injection | Validate all parameters |
| Using `.unwrap()` in commands | Panics crash the app | Use `Result<T, E>` |
| Exposing all filesystem | Security risk | Use scoped permissions |
| Synchronous blocking in commands | Freezes UI | Use `async` functions |
| Not using State for shared data | Data races | Use `tauri::State` with Mutex |
| Hardcoding paths | Breaks cross-platform | Use `BaseDirectory` enum |
| `allow-all` in permissions | Defeats security model | List required permissions |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| "Command not found" | Not registered | Add to `generate_handler![]` |
| `allowlist` errors after v2 | V2 uses capabilities | Migrate to `capabilities/` |
| Frontend can't read file | Missing permissions | Add `fs:allow-read-*` |
| `tauri dev` shows blank window | Dev server not running | Check `devUrl` matches |
| IPC calls are slow | Large payload | Minimize data transfer |
| App crashes on state access | State not initialized | Register with `.manage()` |

## Quick Reference
- [Commands Cheatsheet](quick-ref/commands-cheatsheet.md)
- [Plugins Cheatsheet](quick-ref/plugins-cheatsheet.md)
