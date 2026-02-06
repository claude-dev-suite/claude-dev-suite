# Tauri Plugins Cheatsheet

## Installation Pattern

### Cargo (Rust)
```bash
cargo add tauri-plugin-{name}
```

### npm (Frontend)
```bash
npm install @tauri-apps/plugin-{name}
```

### Register in Rust
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_{name}::init())
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

---

## Dialog Plugin

### Installation
```bash
cargo add tauri-plugin-dialog
npm install @tauri-apps/plugin-dialog
```

### Capabilities
```json
{
  "permissions": [
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-message",
    "dialog:allow-ask",
    "dialog:allow-confirm"
  ]
}
```

### Usage
```typescript
import { open, save, message, ask, confirm } from '@tauri-apps/plugin-dialog';

// Open file
const file = await open({
  multiple: false,
  filters: [{ name: 'Images', extensions: ['png', 'jpg', 'gif'] }]
});

// Open multiple files
const files = await open({ multiple: true });

// Open directory
const dir = await open({ directory: true });

// Save file
const path = await save({
  defaultPath: 'document.txt',
  filters: [{ name: 'Text', extensions: ['txt'] }]
});

// Message dialog
await message('Operation completed!', { title: 'Success', kind: 'info' });

// Ask dialog (Yes/No)
const answer = await ask('Are you sure?', { title: 'Confirm', kind: 'warning' });

// Confirm dialog (Ok/Cancel)
const confirmed = await confirm('Delete this file?', { title: 'Delete' });
```

---

## Filesystem Plugin

### Installation
```bash
cargo add tauri-plugin-fs
npm install @tauri-apps/plugin-fs
```

### Capabilities
```json
{
  "permissions": [
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-remove",
    "fs:allow-rename",
    "fs:allow-copy-file",
    {
      "identifier": "fs:scope",
      "allow": ["$APPDATA/**", "$DOCUMENT/**", "$DOWNLOAD/**"]
    }
  ]
}
```

### Usage
```typescript
import {
  readTextFile, writeTextFile,
  readFile, writeFile,
  exists, mkdir, remove, rename, copyFile,
  readDir,
  BaseDirectory
} from '@tauri-apps/plugin-fs';

// Read text file
const content = await readTextFile('config.json', {
  baseDir: BaseDirectory.AppConfig
});

// Write text file
await writeTextFile('log.txt', 'Log entry\n', {
  baseDir: BaseDirectory.AppLog,
  append: true
});

// Read binary file
const bytes = await readFile('image.png', {
  baseDir: BaseDirectory.Resource
});

// Write binary file
await writeFile('output.bin', new Uint8Array([1, 2, 3]), {
  baseDir: BaseDirectory.AppData
});

// Check existence
if (await exists('config.json', { baseDir: BaseDirectory.AppConfig })) {
  // File exists
}

// Create directory
await mkdir('cache', { baseDir: BaseDirectory.AppData, recursive: true });

// Remove file/directory
await remove('old-file.txt', { baseDir: BaseDirectory.AppData });

// Rename/move
await rename('old.txt', 'new.txt', { oldPathBaseDir: BaseDirectory.AppData });

// Copy
await copyFile('source.txt', 'dest.txt', {
  fromPathBaseDir: BaseDirectory.AppData,
  toPathBaseDir: BaseDirectory.AppData
});

// List directory
const entries = await readDir('documents', { baseDir: BaseDirectory.AppData });
for (const entry of entries) {
  console.log(entry.name, entry.isDirectory);
}
```

### Base Directories
```typescript
enum BaseDirectory {
  AppConfig,    // App config directory
  AppData,      // App data directory
  AppLocalData, // App local data directory
  AppCache,     // App cache directory
  AppLog,       // App log directory
  Audio,        // User's audio directory
  Cache,        // System cache directory
  Config,       // System config directory
  Data,         // System data directory
  Desktop,      // User's desktop
  Document,     // User's documents
  Download,     // User's downloads
  Home,         // User's home directory
  Picture,      // User's pictures
  Public,       // Public directory
  Resource,     // App resources (read-only)
  Runtime,      // Runtime directory
  Temp,         // Temp directory
  Video,        // User's videos
}
```

---

## Shell Plugin

### Installation
```bash
cargo add tauri-plugin-shell
npm install @tauri-apps/plugin-shell
```

### Capabilities
```json
{
  "permissions": [
    "shell:allow-open",
    "shell:allow-execute",
    "shell:allow-spawn",
    "shell:allow-stdin-write",
    "shell:allow-kill"
  ]
}
```

### Usage
```typescript
import { open } from '@tauri-apps/plugin-shell';
import { Command } from '@tauri-apps/plugin-shell';

// Open URL in browser
await open('https://tauri.app');

// Open file with default app
await open('/path/to/file.pdf');

// Execute command
const output = await Command.create('git', ['status']).execute();
console.log(output.stdout);

// Spawn command with streaming output
const command = Command.create('npm', ['install']);
command.on('close', (data) => {
  console.log('Exit code:', data.code);
});
command.on('error', (error) => {
  console.error('Error:', error);
});
command.stdout.on('data', (line) => {
  console.log('stdout:', line);
});
command.stderr.on('data', (line) => {
  console.log('stderr:', line);
});

const child = await command.spawn();

// Write to stdin
await child.write('input\n');

// Kill process
await child.kill();
```

### Scoped Commands (tauri.conf.json)
```json
{
  "plugins": {
    "shell": {
      "scope": [
        { "name": "git", "cmd": "git", "args": true },
        { "name": "npm-install", "cmd": "npm", "args": ["install"] }
      ]
    }
  }
}
```

---

## Store Plugin

### Installation
```bash
cargo add tauri-plugin-store
npm install @tauri-apps/plugin-store
```

### Capabilities
```json
{
  "permissions": [
    "store:allow-get",
    "store:allow-set",
    "store:allow-delete",
    "store:allow-clear",
    "store:allow-keys",
    "store:allow-values",
    "store:allow-entries",
    "store:allow-length",
    "store:allow-load",
    "store:allow-save"
  ]
}
```

### Usage
```typescript
import { Store } from '@tauri-apps/plugin-store';

// Create/load store
const store = new Store('settings.json');

// Set values
await store.set('theme', 'dark');
await store.set('user', { name: 'John', email: 'john@example.com' });

// Get values
const theme = await store.get<string>('theme');
const user = await store.get<{ name: string; email: string }>('user');

// Check key
const hasTheme = await store.has('theme');

// Delete key
await store.delete('theme');

// Get all keys
const keys = await store.keys();

// Get all values
const values = await store.values();

// Get all entries
const entries = await store.entries();

// Clear store
await store.clear();

// Save to disk (auto-saved by default)
await store.save();

// Reload from disk
await store.load();

// Watch for changes
const unlisten = await store.onKeyChange('theme', (value) => {
  console.log('Theme changed:', value);
});
```

---

## HTTP Plugin

### Installation
```bash
cargo add tauri-plugin-http
npm install @tauri-apps/plugin-http
```

### Capabilities
```json
{
  "permissions": [
    "http:default",
    {
      "identifier": "http:default",
      "allow": [
        { "url": "https://api.example.com/**" }
      ]
    }
  ]
}
```

### Usage
```typescript
import { fetch } from '@tauri-apps/plugin-http';

// GET request
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// POST request
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'John' }),
});

// With timeout
const response = await fetch('https://api.example.com/data', {
  connectTimeout: 5000,
});
```

---

## Notification Plugin

### Installation
```bash
cargo add tauri-plugin-notification
npm install @tauri-apps/plugin-notification
```

### Capabilities
```json
{
  "permissions": [
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify",
    "notification:allow-show"
  ]
}
```

### Usage
```typescript
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

// Check and request permission
let permissionGranted = await isPermissionGranted();
if (!permissionGranted) {
  const permission = await requestPermission();
  permissionGranted = permission === 'granted';
}

// Send notification
if (permissionGranted) {
  sendNotification({
    title: 'Download Complete',
    body: 'Your file has been downloaded.',
    icon: 'icons/download.png',
  });
}
```

---

## Clipboard Plugin

### Installation
```bash
cargo add tauri-plugin-clipboard-manager
npm install @tauri-apps/plugin-clipboard-manager
```

### Capabilities
```json
{
  "permissions": [
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text",
    "clipboard-manager:allow-read-image",
    "clipboard-manager:allow-write-image"
  ]
}
```

### Usage
```typescript
import { writeText, readText, writeImage, readImage } from '@tauri-apps/plugin-clipboard-manager';

// Write text
await writeText('Hello, clipboard!');

// Read text
const text = await readText();

// Write image (from file path or base64)
await writeImage('/path/to/image.png');

// Read image
const imageData = await readImage();
```

---

## Updater Plugin

### Installation
```bash
cargo add tauri-plugin-updater
npm install @tauri-apps/plugin-updater
```

### Configuration (tauri.conf.json)
```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY",
      "endpoints": [
        "https://releases.example.com/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

### Usage
```typescript
import { check } from '@tauri-apps/plugin-updater';

const update = await check();
if (update?.available) {
  console.log(`Update to ${update.version} available!`);

  // Download and install
  await update.downloadAndInstall((progress) => {
    console.log(`Downloaded ${progress.downloaded} of ${progress.total}`);
  });

  // Restart app
  await relaunch();
}
```

---

## Window State Plugin

### Installation
```bash
cargo add tauri-plugin-window-state
```

### Registration
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

Automatically saves/restores window position and size.

---

## Log Plugin

### Installation
```bash
cargo add tauri-plugin-log
npm install @tauri-apps/plugin-log
```

### Registration
```rust
use tauri_plugin_log::{Target, TargetKind};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

### Usage
```typescript
import { trace, debug, info, warn, error } from '@tauri-apps/plugin-log';

trace('Trace message');
debug('Debug message');
info('Info message');
warn('Warning message');
error('Error message');
```

---

## Process Plugin

### Installation
```bash
cargo add tauri-plugin-process
npm install @tauri-apps/plugin-process
```

### Usage
```typescript
import { exit, relaunch } from '@tauri-apps/plugin-process';

// Exit app
await exit(0);

// Restart app
await relaunch();
```

---

## OS Plugin

### Installation
```bash
cargo add tauri-plugin-os
npm install @tauri-apps/plugin-os
```

### Usage
```typescript
import { platform, arch, version, type, locale, hostname } from '@tauri-apps/plugin-os';

const os = await platform();      // 'linux', 'macos', 'windows', etc.
const architecture = await arch(); // 'x86', 'x86_64', 'aarch64', etc.
const osVersion = await version(); // '10.0.19041'
const osType = await type();       // 'Linux', 'Darwin', 'Windows_NT'
const userLocale = await locale(); // 'en-US'
const host = await hostname();     // 'my-computer'
```

---

## Plugin Registration Summary

```rust
fn main() {
    tauri::Builder::default()
        // Core plugins
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())

        // UI/UX plugins
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())

        // System plugins
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())

        .invoke_handler(tauri::generate_handler![...])
        .run(tauri::generate_context!())
        .expect("error running app");
}
```
