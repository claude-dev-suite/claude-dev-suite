# Tauri Commands Cheatsheet

## Basic Command Definition

```rust
#[tauri::command]
fn my_command(arg: String) -> String {
    format!("Received: {}", arg)
}

// Register in main.rs or lib.rs
.invoke_handler(tauri::generate_handler![my_command])
```

## Frontend Invocation

```typescript
import { invoke } from '@tauri-apps/api/core';

// Basic call
const result = await invoke<string>('my_command', { arg: 'hello' });

// With error handling
try {
  const data = await invoke<Data>('fetch_data', { id: 123 });
} catch (error) {
  console.error('Command failed:', error);
}
```

---

## Command Patterns

### Sync Command
```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

### Async Command
```rust
#[tauri::command]
async fn fetch_data(url: String) -> Result<Data, String> {
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .json::<Data>()
        .await
        .map_err(|e| e.to_string())
}
```

### With State
```rust
#[tauri::command]
fn increment(state: State<'_, AppState>) -> i32 {
    let mut counter = state.counter.lock().unwrap();
    *counter += 1;
    *counter
}
```

### With App Handle
```rust
#[tauri::command]
async fn show_window(app: AppHandle) {
    app.get_webview_window("main")
        .unwrap()
        .show()
        .unwrap();
}
```

### With Window
```rust
#[tauri::command]
fn get_window_label(window: Window) -> String {
    window.label().to_string()
}
```

---

## Error Handling

### Custom Error Type
```rust
#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
fn load_file(path: String) -> Result<String, CommandError> {
    std::fs::read_to_string(&path)
        .map_err(CommandError::from)
}
```

### Simple String Error
```rust
#[tauri::command]
fn risky_operation() -> Result<Data, String> {
    do_something().map_err(|e| e.to_string())
}
```

---

## State Management

### Define State
```rust
use std::sync::Mutex;

struct AppState {
    counter: Mutex<i32>,
    config: Mutex<Config>,
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            counter: Mutex::new(0),
            config: Mutex::new(Config::default()),
        })
        .invoke_handler(tauri::generate_handler![...])
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

### Access State in Commands
```rust
use tauri::State;

#[tauri::command]
fn get_count(state: State<'_, AppState>) -> i32 {
    *state.counter.lock().unwrap()
}

#[tauri::command]
fn set_config(state: State<'_, AppState>, key: String, value: String) {
    let mut config = state.config.lock().unwrap();
    config.set(key, value);
}
```

---

## Events

### Emit from Rust
```rust
use tauri::Emitter;

#[tauri::command]
fn start_download(app: AppHandle, url: String) {
    std::thread::spawn(move || {
        for progress in 0..=100 {
            app.emit("download-progress", progress).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        app.emit("download-complete", url).unwrap();
    });
}
```

### Listen in Frontend
```typescript
import { listen, once } from '@tauri-apps/api/event';

// Continuous listening
const unlisten = await listen<number>('download-progress', (event) => {
  console.log('Progress:', event.payload);
});

// Listen once
await once<string>('download-complete', (event) => {
  console.log('Downloaded:', event.payload);
});

// Cleanup
unlisten();
```

### Window-specific Events
```rust
#[tauri::command]
fn notify_window(window: Window, message: String) {
    window.emit("notification", message).unwrap();
}
```

---

## Command Registration

### Single File
```rust
// lib.rs
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::fetch_data,
            commands::save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

### Multiple Modules
```rust
// commands/mod.rs
mod file_ops;
mod network;
mod settings;

pub use file_ops::*;
pub use network::*;
pub use settings::*;
```

---

## TypeScript Type Safety

### Generate Types (recommended)
```bash
# Using tauri-specta
cargo add tauri-specta specta
```

```rust
use specta::Type;
use tauri_specta::{collect_commands, Builder};

#[derive(serde::Serialize, Type)]
struct User {
    id: i32,
    name: String,
}

#[tauri::command]
#[specta::specta]
fn get_user(id: i32) -> User {
    User { id, name: "John".into() }
}

fn main() {
    let builder = Builder::<tauri::Wry>::new()
        .commands(collect_commands![get_user]);

    #[cfg(debug_assertions)]
    builder.export(specta_typescript::Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export types");
}
```

### Manual Types
```typescript
// src/lib/commands.ts
interface User {
  id: number;
  name: string;
}

export async function getUser(id: number): Promise<User> {
  return invoke<User>('get_user', { id });
}
```

---

## Common Patterns

### CRUD Operations
```rust
#[tauri::command]
async fn create_item(state: State<'_, Db>, item: NewItem) -> Result<Item, String> {
    state.insert(item).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_item(state: State<'_, Db>, id: i32) -> Result<Item, String> {
    state.get(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_item(state: State<'_, Db>, item: Item) -> Result<(), String> {
    state.update(item).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_item(state: State<'_, Db>, id: i32) -> Result<(), String> {
    state.delete(id).await.map_err(|e| e.to_string())
}
```

### File Operations
```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```

### Background Task with Progress
```rust
#[tauri::command]
async fn process_files(app: AppHandle, files: Vec<String>) -> Result<(), String> {
    let total = files.len();

    for (i, file) in files.iter().enumerate() {
        // Process file...
        process_file(file).await?;

        // Report progress
        app.emit("process-progress", (i + 1, total)).unwrap();
    }

    Ok(())
}
```
