# Tauri Advanced Patterns

## Event System

```rust
use tauri::{Manager, Emitter};

// Emit event from Rust
#[tauri::command]
fn start_process(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for i in 0..100 {
            app.emit("progress", i).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        app.emit("complete", "Done!").unwrap();
    });
}
```

```typescript
import { listen } from '@tauri-apps/api/event';

// Listen to events
const unlistenProgress = await listen<number>('progress', (event) => {
  console.log(`Progress: ${event.payload}%`);
});

const unlistenComplete = await listen<string>('complete', (event) => {
  console.log(`Complete: ${event.payload}`);
  unlistenProgress();
  unlistenComplete();
});

await invoke('start_process');
```

---

## Plugins

### Dialog Plugin

```typescript
import { open, save, message, ask, confirm } from '@tauri-apps/plugin-dialog';

// Open file
const file = await open({
  multiple: false,
  filters: [{ name: 'Documents', extensions: ['pdf', 'txt'] }]
});

// Open multiple files
const files = await open({ multiple: true });

// Open directory
const dir = await open({ directory: true });

// Save file dialog
const savePath = await save({
  defaultPath: 'document.txt',
  filters: [{ name: 'Text', extensions: ['txt'] }]
});

// Message box
await message('Operation completed!', { title: 'Success', kind: 'info' });

// Confirmation
const confirmed = await confirm('Are you sure?', { title: 'Confirm', kind: 'warning' });

// Ask (Yes/No/Cancel)
const answer = await ask('Save changes?', { title: 'Unsaved Changes' });
```

### Filesystem Plugin

```typescript
import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  remove,
  exists,
  BaseDirectory
} from '@tauri-apps/plugin-fs';

// Read file from app config
const content = await readTextFile('config.json', {
  baseDir: BaseDirectory.AppConfig
});

// Write file to app data
await writeTextFile('data.json', JSON.stringify(data), {
  baseDir: BaseDirectory.AppData
});

// List directory
const entries = await readDir('documents', {
  baseDir: BaseDirectory.Home
});

// Create directory
await mkdir('my-app/cache', {
  baseDir: BaseDirectory.AppData,
  recursive: true
});

// Check existence
if (await exists('config.json', { baseDir: BaseDirectory.AppConfig })) {
  // File exists
}
```

### Store Plugin (Persistent Storage)

```typescript
import { Store } from '@tauri-apps/plugin-store';

const store = new Store('settings.json');

// Set values
await store.set('theme', 'dark');
await store.set('user', { name: 'Alice', preferences: {} });

// Get values
const theme = await store.get<string>('theme');
const user = await store.get<User>('user');

// Check key
const hasTheme = await store.has('theme');

// Delete key
await store.delete('theme');

// Get all keys
const keys = await store.keys();

// Save to disk (usually auto-saved)
await store.save();

// Watch for changes
await store.onKeyChange('theme', (value) => {
  console.log('Theme changed:', value);
});
```

---

## Bundling

### Build Commands

```bash
# Development
npm run tauri dev

# Production build
npm run tauri build

# Specific target
npm run tauri build --target x86_64-pc-windows-msvc
npm run tauri build --target aarch64-apple-darwin
npm run tauri build --target x86_64-unknown-linux-gnu

# Generate icons
npm run tauri icon ./app-icon.png

# Debug build
npm run tauri build --debug
```

### Bundle Configuration

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "dmg", "app", "appimage", "deb"],
    "identifier": "com.company.myapp",
    "publisher": "My Company",
    "category": "Productivity",
    "copyright": "Copyright (c) 2024",
    "shortDescription": "A great app",
    "longDescription": "A longer description of the app...",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": ["resources/*"],
    "windows": {
      "nsis": {
        "installMode": "perUser",
        "installerIcon": "icons/icon.ico"
      }
    },
    "macOS": {
      "minimumSystemVersion": "10.13"
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      }
    }
  }
}
```

### Code Signing

```bash
# macOS
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAM_ID"

# Windows
export TAURI_SIGNING_PRIVATE_KEY="path/to/certificate.pfx"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="password"
```

---

## Testing

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        let result = greet("World");
        assert_eq!(result, "Hello, World!");
    }

    #[tokio::test]
    async fn test_get_user() {
        let result = get_user(1).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Alice");
    }

    #[tokio::test]
    async fn test_get_user_not_found() {
        let result = get_user(0).await;
        assert!(result.is_err());
    }
}
```

### Frontend Tests (Vitest)

```typescript
// src/lib/utils.test.ts
import { describe, it, expect, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('greet', () => {
  it('should return greeting', async () => {
    vi.mocked(invoke).mockResolvedValue('Hello, World!');

    const result = await invoke<string>('greet', { name: 'World' });

    expect(result).toBe('Hello, World!');
    expect(invoke).toHaveBeenCalledWith('greet', { name: 'World' });
  });
});
```

---

## Input Validation

```rust
use regex::Regex;

#[tauri::command]
fn save_user(name: String, email: String) -> Result<(), CommandError> {
    // Validate name
    if name.is_empty() || name.len() > 100 {
        return Err(CommandError {
            code: "INVALID_NAME".to_string(),
            message: "Name must be 1-100 characters".to_string(),
        });
    }

    // Validate email
    let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    if !email_regex.is_match(&email) {
        return Err(CommandError {
            code: "INVALID_EMAIL".to_string(),
            message: "Invalid email format".to_string(),
        });
    }

    // Save to database...
    Ok(())
}
```
