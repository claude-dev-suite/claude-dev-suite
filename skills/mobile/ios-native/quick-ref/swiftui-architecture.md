# SwiftUI Architecture — Deep Reference

NavigationStack, NavigationSplitView, sheets, alerts, focus, lifecycle.

## NavigationStack — Type-Safe Paths

```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            HomeView()
                .navigationDestination(for: Wallet.self) { wallet in
                    WalletDetailView(wallet: wallet, path: $path)
                }
                .navigationDestination(for: TransactionRoute.self) { route in
                    TransactionView(route: route)
                }
        }
    }
}
```

Append any `Hashable`:

```swift
path.append(wallet)
path.append(TransactionRoute(txId: "abc"))
path.removeLast()
path.removeLast(2)
path = NavigationPath()  // pop to root
```

For typed path:

```swift
@State private var path: [AppRoute] = []

enum AppRoute: Hashable {
    case wallet(Wallet)
    case transaction(String)
    case sendForm(Wallet)
}

NavigationStack(path: $path) {
    HomeView()
        .navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .wallet(let w): WalletDetailView(wallet: w)
            case .transaction(let id): TransactionView(txId: id)
            case .sendForm(let w): SendView(wallet: w)
            }
        }
}
```

## Sheets, FullScreenCover, Popover

### Sheet

```swift
struct ContentView: View {
    @State private var showSendSheet = false

    var body: some View {
        Button("Send") { showSendSheet = true }
            .sheet(isPresented: $showSendSheet) {
                SendView()
            }
    }
}
```

### Sheet with item (data-driven)

```swift
struct ContentView: View {
    @State private var selectedWallet: Wallet?

    var body: some View {
        Button("Open wallet") { selectedWallet = myWallet }
            .sheet(item: $selectedWallet) { wallet in
                WalletDetailView(wallet: wallet)
            }
    }
}

extension Wallet: Identifiable { /* must be Identifiable */ }
```

### Detents (iOS 16+)

```swift
.sheet(isPresented: $showSheet) {
    SendView()
        .presentationDetents([.medium, .large, .custom(MyDetent.self)])
        .presentationDragIndicator(.visible)
        .presentationBackground(.regularMaterial)
        .presentationCornerRadius(24)
}
```

### FullScreenCover

```swift
.fullScreenCover(isPresented: $showOnboarding) {
    OnboardingFlow()
}
```

### Popover (iPad/Mac, falls back to sheet on iPhone)

```swift
.popover(isPresented: $showInfo) {
    Text("Info content").padding()
}
```

## Alerts and Confirmation Dialogs

```swift
struct DeleteButton: View {
    @State private var showConfirm = false

    var body: some View {
        Button("Delete") { showConfirm = true }
            .alert("Delete wallet?", isPresented: $showConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) { delete() }
            } message: {
                Text("This action cannot be undone.")
            }
    }
}

// Confirmation Dialog (action sheet on phone, popover on iPad)
.confirmationDialog("Choose action", isPresented: $showActions) {
    Button("Send") { send() }
    Button("Receive") { receive() }
    Button("Cancel", role: .cancel) {}
}
```

## Focus Management

```swift
struct LoginForm: View {
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    enum Field: Hashable { case email, password }

    var body: some View {
        Form {
            TextField("Email", text: $email)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)

            SecureField("Password", text: $password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit { login() }
        }
        .onAppear { focusedField = .email }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
    }
}
```

## Toolbars

```swift
struct WalletDetail: View {
    var body: some View {
        VStack { /* content */ }
            .navigationTitle("Wallet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Share", systemImage: "square.and.arrow.up") { share() }
                        Button("Edit", systemImage: "pencil") { edit() }
                        Button("Delete", systemImage: "trash", role: .destructive) { delete() }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Spacer()
                    Button(action: send) { Image(systemName: "paperplane") }
                    Spacer()
                }
            }
    }
}
```

Placements: `.topBarLeading`, `.topBarTrailing`, `.principal` (center), `.bottomBar`, `.keyboard`, `.confirmationAction`, `.cancellationAction`.

## TabView

```swift
struct AppTabs: View {
    @State private var selection: Tab = .home

    enum Tab { case home, wallets, settings }

    var body: some View {
        TabView(selection: $selection) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(Tab.home)
            WalletsView()
                .tabItem { Label("Wallets", systemImage: "wallet.pass") }
                .tag(Tab.wallets)
                .badge(3)                           // notification count
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
                .tag(Tab.settings)
        }
    }
}
```

For iPad sidebar navigation:

```swift
TabView { /* ... */ }
    .tabViewStyle(.sidebarAdaptable)            // iOS 18+
```

## Lifecycle Modifiers

| Modifier | Triggered |
|---|---|
| `.onAppear { }` | View appears (each time) |
| `.onDisappear { }` | View disappears |
| `.task { }` | View appears, cancelled when disappears |
| `.task(id:) { }` | When id changes (and on appear) |
| `.onChange(of: value) { old, new in }` | Value changes |
| `.onReceive(publisher) { }` | Combine publisher emits |
| `.onSubmit { }` | TextField/SecureField submitted |
| `.onLongPressGesture` | Long press detected |
| `.scenePhase` env | Scene background/foreground transitions |

```swift
struct ContentView: View {
    @Environment(\.scenePhase) var scenePhase

    var body: some View {
        Text("App")
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active: resumeWork()
                case .inactive: pauseWork()
                case .background: saveState()
                @unknown default: break
                }
            }
    }
}
```

## ViewBuilder & ViewModifier

### Custom ViewModifier

```swift
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.regularMaterial)
            .clipShape(.rect(cornerRadius: 16))
            .shadow(radius: 4)
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardStyle()) }
}

// Usage
Text("Hello").cardStyle()
```

### @ViewBuilder for conditional content

```swift
@ViewBuilder
func contentView(state: UiState) -> some View {
    switch state {
    case .loading:
        ProgressView()
    case .success(let wallet):
        WalletDetail(wallet: wallet)
    case .error(let msg):
        ErrorView(message: msg)
    }
}
```

## Animations

```swift
struct ExpandableCard: View {
    @State private var expanded = false

    var body: some View {
        VStack {
            Text("Tap to expand").onTapGesture {
                withAnimation(.spring(duration: 0.3)) {
                    expanded.toggle()
                }
            }
            if expanded {
                Text("Content here").transition(.opacity.combined(with: .scale))
            }
        }
        .animation(.default, value: expanded)
    }
}

// Spring with custom params
withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { /* ... */ }

// Phase-based animation (iOS 17+)
Image(systemName: "heart.fill")
    .symbolEffect(.bounce, value: liked)

// Keyframe animation (iOS 17+)
KeyframeAnimator(
    initialValue: AnimationState(),
    trigger: trigger,
) { state in
    Circle().offset(state.offset)
} keyframes: { _ in
    KeyframeTrack(\.offset.x) {
        SpringKeyframe(100, duration: 0.5)
        CubicKeyframe(0, duration: 0.5)
    }
}
```

## Open URL Handling

```swift
struct ContentView: View {
    var body: some View {
        Text("App")
            .onOpenURL { url in
                handleDeepLink(url)
            }
    }

    func handleDeepLink(_ url: URL) {
        // bitcoin:bc1q...?amount=0.001
        if url.scheme == "bitcoin" {
            let address = url.host
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let amount = comps?.queryItems?.first { $0.name == "amount" }?.value
            // navigate to send screen
        }
    }
}
```

For Universal Links, also implement `.onContinueUserActivity`:

```swift
.onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
    if let url = activity.webpageURL {
        handleDeepLink(url)
    }
}
```

## Environment Values (Built-in)

| Key | Type | Use |
|---|---|---|
| `\.colorScheme` | `ColorScheme` | `.light` or `.dark` |
| `\.dynamicTypeSize` | `DynamicTypeSize` | User's text size preference |
| `\.locale` | `Locale` | Current locale |
| `\.calendar` | `Calendar` | Current calendar |
| `\.timeZone` | `TimeZone` | Current timezone |
| `\.openURL` | `OpenURLAction` | `openURL(url)` |
| `\.dismiss` | `DismissAction` | `dismiss()` to pop/close |
| `\.scenePhase` | `ScenePhase` | active/inactive/background |
| `\.horizontalSizeClass` | `UserInterfaceSizeClass?` | compact/regular |
| `\.isEnabled` | `Bool` | Whether view is enabled |
| `\.editMode` | `Binding<EditMode>?` | List edit mode |

```swift
struct ChildView: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.openURL) var openURL
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        Button("Cancel") { dismiss() }
        Button("Open site") { openURL(URL(string: "https://...")!) }
    }
}
```

## Performance Tips

- Use `LazyVStack`/`LazyHStack` only when content is large (>50 items)
- Pass `Identifiable` data with stable `id` to lists
- Avoid `AnyView` — prefer `@ViewBuilder` + `Group { }`
- Use `.equatable()` modifier on expensive views to skip recomputation
- Profile with Instruments → SwiftUI template
- For massive scroll perf, fall back to `UICollectionView` via `UIViewRepresentable`

## Pitfalls

| Pitfall | Fix |
|---|---|
| `@StateObject` on `@Observable` class | Wrong — use `@State` |
| Network call in view body | Move to `.task { }` or `@Observable` model |
| `@State` for shared model | Use `@Observable` + `.environment()` |
| `NavigationStack(path:)` on iOS <16 | Falls back to NavigationView; or check availability |
| Sheets stacking on rapid taps | Use `item:` form with optional state |
| TabView selection lost on push | Use NavigationStack inside each tab |
| Animation jank | Use `.transaction { $0.animation = nil }` to disable per-update |
| Using `@AppStorage` for sensitive data | Move to Keychain |
| Forgetting `.id()` on dynamic views | View identity confused, animations break |
| `withAnimation` outside binding | Won't animate — wrap state mutation |
