---
name: react-native
description: |
  React Native mobile development. Core components, navigation (React Navigation),
  platform-specific code, native modules, performance optimization, and debugging.

  USE WHEN: user mentions "React Native", "react-native", "mobile app with React",
  "cross-platform mobile", "RN", "react-native-cli"

  DO NOT USE FOR: Expo-specific features - use `expo`;
  Flutter - use `flutter`; web React - use `react` skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Native

## Core Components

```tsx
import { View, Text, ScrollView, FlatList, Pressable, StyleSheet } from 'react-native';

function ProductList({ products }: { products: Product[] }) {
  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigate('Detail', { id: item.id })} style={styles.card}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.price}>${item.price}</Text>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 14, color: '#666', marginTop: 4 },
  separator: { height: 1, backgroundColor: '#eee' },
});
```

## Navigation (React Navigation)

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

type RootStackParamList = {
  Home: undefined;
  Detail: { id: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Detail" component={DetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Type-safe navigation
import { NativeStackScreenProps } from '@react-navigation/native-stack';
type DetailProps = NativeStackScreenProps<RootStackParamList, 'Detail'>;

function DetailScreen({ route, navigation }: DetailProps) {
  const { id } = route.params;
  return <Text>{id}</Text>;
}
```

## Platform-Specific Code

```tsx
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 },
    android: { elevation: 3 },
  }),
});

// File-based: Component.ios.tsx / Component.android.tsx (auto-resolved)
```

## Networking

```tsx
import { useQuery, useMutation } from '@tanstack/react-query';

function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/products`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<Product[]>;
    },
  });
}
```

## Secure Storage

```tsx
import EncryptedStorage from 'react-native-encrypted-storage';

await EncryptedStorage.setItem('auth_token', token);
const token = await EncryptedStorage.getItem('auth_token');
await EncryptedStorage.removeItem('auth_token');
```

## Performance

| Technique | Impact |
|-----------|--------|
| `FlatList` over `ScrollView` for lists | High |
| `React.memo` on list items | Medium |
| `useCallback` for event handlers in lists | Medium |
| Hermes engine (default in RN 0.70+) | High |
| Avoid inline styles in render | Low-Medium |
| `InteractionManager.runAfterInteractions` | Medium |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| ScrollView for long lists | Use FlatList or FlashList |
| Inline functions in FlatList renderItem | Extract component, use React.memo |
| Storing tokens in AsyncStorage | Use react-native-encrypted-storage |
| No error boundaries | Wrap screens in error boundaries |
| Ignoring keyboard on forms | Use KeyboardAvoidingView |

## Production Checklist

- [ ] Hermes engine enabled
- [ ] ProGuard/R8 for Android release builds
- [ ] App signing configured (Android keystore, iOS certificates)
- [ ] Deep linking configured
- [ ] Error tracking (Sentry, Bugsnag)
- [ ] OTA updates (CodePush or Expo Updates)
- [ ] Performance monitoring (Flipper, React DevTools)
