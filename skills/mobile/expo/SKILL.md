---
name: expo
description: |
  Expo framework for React Native. Managed and bare workflows, Expo Router,
  EAS Build/Submit/Update, config plugins, and Expo SDK modules.

  USE WHEN: user mentions "Expo", "expo-router", "EAS Build", "expo-cli",
  "app.json", "expo-config-plugin", "Expo Go"

  DO NOT USE FOR: bare React Native without Expo - use `react-native`;
  Flutter - use `flutter`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Expo

## Project Setup

```bash
npx create-expo-app@latest my-app --template tabs
cd my-app && npx expo start
```

## Expo Router (file-based routing)

```
app/
├── _layout.tsx          # Root layout
├── index.tsx            # / route
├── (tabs)/
│   ├── _layout.tsx      # Tab layout
│   ├── home.tsx         # /home tab
│   └── profile.tsx      # /profile tab
└── product/[id].tsx     # /product/:id
```

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
    </Stack>
  );
}

// app/product/[id].tsx
import { useLocalSearchParams } from 'expo-router';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Product {id}</Text>;
}

// Navigate
import { router } from 'expo-router';
router.push('/product/123');
```

## app.json / app.config.ts

```typescript
// app.config.ts (dynamic config)
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'My App',
  slug: 'my-app',
  version: '1.0.0',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { package: 'com.example.myapp' },
  plugins: ['expo-camera', 'expo-location'],
  extra: {
    apiUrl: process.env.API_URL ?? 'https://api.example.com',
  },
});
```

## EAS Build & Submit

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

```json
// eas.json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  }
}
```

## EAS Update (OTA)

```bash
eas update --branch production --message "Fix login bug"
```

```typescript
import * as Updates from 'expo-updates';

async function checkForUpdates() {
  const update = await Updates.checkForUpdateAsync();
  if (update.isAvailable) {
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  }
}
```

## Common Expo SDK Modules

```tsx
// Camera
import { CameraView, useCameraPermissions } from 'expo-camera';

// Location
import * as Location from 'expo-location';
const { status } = await Location.requestForegroundPermissionsAsync();
const location = await Location.getCurrentPositionAsync({});

// Secure Store
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('token', value);
const token = await SecureStore.getItemAsync('token');

// Notifications
import * as Notifications from 'expo-notifications';
const { status } = await Notifications.requestPermissionsAsync();
const token = (await Notifications.getExpoPushTokenAsync()).data;
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Ejecting for simple native needs | Use config plugins or Expo Modules API |
| Hardcoded API URLs | Use `app.config.ts` with `extra` and env vars |
| No EAS Update for JS fixes | Set up EAS Update for OTA patches |
| Using Expo Go for production testing | Use development builds (`npx expo run:ios`) |
| Ignoring permission UX | Request permissions contextually with explanation |

## Production Checklist

- [ ] EAS Build profiles configured (dev, preview, production)
- [ ] EAS Update configured for OTA
- [ ] App store metadata and screenshots prepared
- [ ] Splash screen and app icon configured
- [ ] Environment variables via `app.config.ts`
- [ ] Error tracking (Sentry Expo)
- [ ] Deep linking scheme configured
