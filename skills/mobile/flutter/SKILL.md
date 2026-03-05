---
name: flutter
description: |
  Flutter cross-platform development with Dart. Widgets, state management (Riverpod,
  BLoC), navigation, platform channels, and production patterns.

  USE WHEN: user mentions "Flutter", "Dart", "flutter widget", "Riverpod",
  "BLoC", "flutter build", "pubspec.yaml"

  DO NOT USE FOR: React Native - use `react-native`;
  Expo - use `expo`; native iOS/Android
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Flutter

## Widget Basics

```dart
class ProductCard extends StatelessWidget {
  final Product product;
  final VoidCallback onTap;

  const ProductCard({super.key, required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(product.name, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text('\$${product.price}', style: const TextStyle(color: Colors.grey)),
            ],
          ),
        ),
      ),
    );
  }
}
```

## State Management (Riverpod — recommended)

```dart
// Provider definition
final productsProvider = FutureProvider<List<Product>>((ref) async {
  final repo = ref.watch(productRepoProvider);
  return repo.fetchAll();
});

// Usage in widget
class ProductListScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);

    return products.when(
      data: (items) => ListView.builder(
        itemCount: items.length,
        itemBuilder: (context, i) => ProductCard(product: items[i], onTap: () {}),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Error: $err')),
    );
  }
}
```

## Navigation (GoRouter)

```dart
final router = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/product/:id',
      builder: (_, state) => ProductScreen(id: state.pathParameters['id']!),
    ),
  ],
);

// Navigate
context.go('/product/123');
context.push('/product/123'); // pushes onto stack
```

## HTTP Requests (Dio)

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  },
));

Future<List<Product>> fetchProducts() async {
  final response = await dio.get('/products');
  return (response.data as List).map((e) => Product.fromJson(e)).toList();
}
```

## Platform Channels

```dart
// Dart side
const channel = MethodChannel('com.example/battery');

Future<int> getBatteryLevel() async {
  final level = await channel.invokeMethod<int>('getBatteryLevel');
  return level ?? -1;
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| setState in large widgets | Extract state to Riverpod/BLoC |
| Deeply nested widget trees | Extract widgets into separate classes |
| No const constructors | Add `const` to stateless constructors |
| String-based navigation | Use GoRouter with type-safe routes |
| No error handling on futures | Use `.when()` or try-catch |

## Production Checklist

- [ ] Release mode builds tested on real devices
- [ ] App signing (Android keystore, iOS distribution cert)
- [ ] Flavor/scheme setup for dev/staging/prod
- [ ] Crashlytics or Sentry integration
- [ ] ProGuard rules for Android
- [ ] App size optimized (deferred components, tree shaking)
- [ ] Accessibility: Semantics widgets used
