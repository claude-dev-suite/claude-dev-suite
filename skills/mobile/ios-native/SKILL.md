---
name: ios-native
description: |
  iOS native platform development with SwiftUI 6.x: app architecture (App protocol,
  Scene, WindowGroup), navigation (NavigationStack, NavigationSplitView), state
  (@State, @Binding, @Observable, @Environment), Keychain Services with biometric
  protection, Secure Enclave (P-256 hardware-isolated keys), App Lifecycle (BGTaskScheduler,
  Background Modes), Universal Links, App Groups, Share Extensions, Privacy Manifest,
  StoreKit 2.

  USE WHEN: user mentions "SwiftUI", "@Observable", "NavigationStack", "@AppStorage",
  "Keychain Services", "Secure Enclave", "BGTaskScheduler", "Universal Links",
  "App Groups", "Share Extension", "Privacy Manifest", "StoreKit", "iOS native",
  "@SceneStorage", "@FocusState"

  DO NOT USE FOR: Compose Multiplatform on iOS - use `frontend-frameworks/compose-multiplatform`
  DO NOT USE FOR: Swift language patterns - use `languages/swift`
  DO NOT USE FOR: Rust ↔ Swift bindings - use `languages/uniffi`
  DO NOT USE FOR: Cross-platform iOS+Android - use `mobile/kotlin-multiplatform`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# iOS Native Development (SwiftUI + Platform APIs)

> **References**: [swiftui-architecture.md](quick-ref/swiftui-architecture.md) for App lifecycle, Scene/WindowGroup, navigation (NavigationStack with type-safe paths, NavigationSplitView), state management with `@Observable` (Swift 5.9+ replacement for ObservableObject), focus, sheets/alerts. [secure-storage.md](quick-ref/secure-storage.md) for Keychain Services deep dive (access groups, biometric SAC, iCloud sync, key migration), Secure Enclave key generation, attestation. [system-integration.md](quick-ref/system-integration.md) for Background Tasks (BGTaskScheduler), Universal Links (associated domains), App Groups, Share Extensions, Privacy Manifest, StoreKit 2.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `ios` or `swiftui`.

## App Entry Point (SwiftUI App Protocol)

```swift
import SwiftUI

@main
struct BHODLApp: App {
    @State private var sessionStore = SessionStore()                // @Observable model

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(sessionStore)
        }
    }
}

@Observable                                                         // Swift 5.9+
class SessionStore {
    var isAuthenticated = false
    var userId: String?
}
```

`@Observable` (from `Observation` framework, Swift 5.9+) replaces `ObservableObject` + `@Published`. Cleaner, more performant — only re-renders views that read changed properties.

## Scene Types

| Scene | Use case |
|---|---|
| `WindowGroup` | Standard app window (multi-window on iPad/Mac) |
| `DocumentGroup` | Document-based app (file editor, drawing) |
| `Settings` | macOS Settings scene (Mac-only) |
| `MenuBarExtra` | Menu bar item (macOS) |
| `ImmersiveSpace` | visionOS immersive scene |

```swift
@main
struct BHODLApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}
```

## State Management

### @State (Local view state)

```swift
struct CounterView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") { count += 1 }
        }
    }
}
```

### @Binding (Two-way reference to state owned elsewhere)

```swift
struct ToggleRow: View {
    @Binding var isOn: Bool
    let title: String

    var body: some View {
        Toggle(title, isOn: $isOn)
    }
}

// Usage
struct SettingsView: View {
    @State private var notifications = true

    var body: some View {
        ToggleRow(isOn: $notifications, title: "Notifications")
    }
}
```

### @Observable (Shared model)

```swift
@Observable
class WalletStore {
    var wallets: [Wallet] = []
    var isLoading = false
    var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            wallets = try await api.fetchWallets()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct WalletList: View {
    @State private var store = WalletStore()

    var body: some View {
        List(store.wallets) { wallet in
            WalletRow(wallet: wallet)
        }
        .task { await store.load() }
    }
}
```

### @Environment (Dependency injection via env)

```swift
// Custom env value
private struct WalletAPIKey: EnvironmentKey {
    static let defaultValue: WalletAPI = LiveWalletAPI()
}

extension EnvironmentValues {
    var walletAPI: WalletAPI {
        get { self[WalletAPIKey.self] }
        set { self[WalletAPIKey.self] = newValue }
    }
}

// Inject
ContentView()
    .environment(\.walletAPI, MockWalletAPI())

// Read
struct WalletList: View {
    @Environment(\.walletAPI) var api
    // ...
}

// For @Observable types — direct env injection (Swift 5.9+)
@main
struct BHODLApp: App {
    @State private var store = WalletStore()

    var body: some Scene {
        WindowGroup {
            ContentView().environment(store)
        }
    }
}

struct ChildView: View {
    @Environment(WalletStore.self) var store
    // ...
}
```

### @AppStorage (UserDefaults binding)

```swift
struct SettingsView: View {
    @AppStorage("theme") var theme: String = "system"
    @AppStorage("biometric_enabled") var biometricEnabled: Bool = false

    var body: some View {
        Form {
            Picker("Theme", selection: $theme) {
                Text("Light").tag("light")
                Text("Dark").tag("dark")
                Text("System").tag("system")
            }
            Toggle("Biometric unlock", isOn: $biometricEnabled)
        }
    }
}
```

For App Groups (shared with extensions):

```swift
@AppStorage("theme", store: UserDefaults(suiteName: "group.com.bhodl"))
var theme: String = "system"
```

### @SceneStorage (Per-scene state survival)

```swift
struct SearchView: View {
    @SceneStorage("search_query") var query: String = ""

    var body: some View {
        TextField("Search", text: $query)
            // Survives app suspension/scene restoration
    }
}
```

## Navigation

### NavigationStack (Type-safe paths — iOS 16+)

```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            HomeView()
                .navigationDestination(for: Wallet.self) { wallet in
                    WalletDetailView(wallet: wallet)
                }
                .navigationDestination(for: Transaction.self) { tx in
                    TransactionDetailView(transaction: tx)
                }
        }
    }
}

// Navigate by appending to path
struct HomeView: View {
    @Binding var path: NavigationPath  // or pass from environment

    var body: some View {
        Button("Open wallet") {
            path.append(myWallet)       // any Hashable type
        }
    }
}

// Pop
path.removeLast()
path = NavigationPath()                  // pop to root
```

For type-safe path with explicit enum:

```swift
enum AppRoute: Hashable {
    case wallet(id: String)
    case transaction(txId: String)
    case settings
}

@State private var path: [AppRoute] = []

NavigationStack(path: $path) {
    HomeView()
        .navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .wallet(let id): WalletDetailView(walletId: id)
            case .transaction(let txId): TransactionDetailView(txId: txId)
            case .settings: SettingsView()
            }
        }
}
```

### NavigationSplitView (iPad/Mac master-detail)

```swift
struct ContentView: View {
    @State private var selectedWallet: Wallet?
    @State private var selectedTx: Transaction?

    var body: some View {
        NavigationSplitView {
            WalletList(selection: $selectedWallet)
        } content: {
            if let wallet = selectedWallet {
                TransactionList(walletId: wallet.id, selection: $selectedTx)
            } else {
                Text("Select a wallet")
            }
        } detail: {
            if let tx = selectedTx {
                TransactionDetailView(transaction: tx)
            } else {
                Text("Select a transaction")
            }
        }
    }
}
```

Auto-collapses to NavigationStack on iPhone.

See [swiftui-architecture.md](quick-ref/swiftui-architecture.md) for sheets, fullScreenCover, alerts, popovers, deep linking.

## Common UI Patterns

### List with Sections

```swift
struct WalletListView: View {
    let wallets: [Wallet]

    var body: some View {
        List {
            Section("On-chain") {
                ForEach(wallets.filter { $0.type == .onchain }) { w in
                    WalletRow(wallet: w)
                }
            }
            Section("Lightning") {
                ForEach(wallets.filter { $0.type == .lightning }) { w in
                    WalletRow(wallet: w)
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}
```

### Forms

```swift
struct SendView: View {
    @State private var address = ""
    @State private var amount = ""
    @FocusState private var focusedField: Field?

    enum Field: Hashable {
        case address, amount
    }

    var body: some View {
        Form {
            Section("Recipient") {
                TextField("Bitcoin address", text: $address)
                    .focused($focusedField, equals: .address)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Section("Amount") {
                TextField("Sats", text: $amount)
                    .focused($focusedField, equals: .amount)
                    .keyboardType(.numberPad)
            }
            Button("Send") { send() }
                .disabled(address.isEmpty || amount.isEmpty)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
    }
}
```

### Pull-to-Refresh

```swift
struct WalletList: View {
    @State private var store = WalletStore()

    var body: some View {
        List(store.wallets) { wallet in
            WalletRow(wallet: wallet)
        }
        .refreshable {
            await store.load()
        }
    }
}
```

### Searchable

```swift
struct WalletList: View {
    @State private var query = ""
    @State private var store = WalletStore()

    var filtered: [Wallet] {
        query.isEmpty ? store.wallets : store.wallets.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        List(filtered) { wallet in WalletRow(wallet: wallet) }
            .searchable(text: $query, prompt: "Search wallets")
    }
}
```

## Async Tasks in Views

```swift
struct WalletDetail: View {
    let walletId: String
    @State private var balance: Balance?

    var body: some View {
        VStack {
            if let balance {
                Text("\(balance.confirmed) sats")
            } else {
                ProgressView()
            }
        }
        .task(id: walletId) {                              // re-runs when walletId changes
            do {
                balance = try await api.fetchBalance(id: walletId)
            } catch {
                // handle
            }
        }
    }
}
```

`.task { }` runs when view appears, cancels when view disappears. `task(id:)` re-runs when id changes.

## Keychain Services (Quick)

```swift
import Security

func saveSecret(_ data: Data, account: String, service: String) throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: service,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.status(status) }
}

func loadSecret(account: String, service: String) throws -> Data {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: service,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else {
        throw KeychainError.status(status)
    }
    return data
}
```

For Keychain access groups, biometric SAC, iCloud sync, see [secure-storage.md](quick-ref/secure-storage.md).

## Secure Enclave (Quick)

```swift
import CryptoKit
import LocalAuthentication

func generateSEPKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
    let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        nil
    )!

    return try SecureEnclave.P256.Signing.PrivateKey(
        accessControl: access,
        authenticationContext: LAContext()
    )
}

let key = try generateSEPKey()
let signature = try key.signature(for: dataToSign)        // prompts biometric
```

P-256 only — for wallet seeds, use SEP to wrap/unwrap an AES key, store wrapped seed in Keychain.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `ObservableObject` + `@Published` for new code | Re-renders entire view tree | Use `@Observable` (Swift 5.9+) |
| `@StateObject` for `@Observable` types | Wrong wrapper | Use `@State` (since `@Observable` already manages identity) |
| Force-unwrap `try!` outside tests | Crash on error | Proper `do/catch` |
| `Task { ... }` without `[weak self]` for long ops | Retain cycle | `[weak self]` or use `.task { }` |
| Network in view body | Recomputed on each render | Use `.task { }` or model |
| `print` for production logs | No filter, no privacy redaction | `Logger(subsystem:category:)` with privacy markers |
| `Foundation` `Date` math | Timezone bugs | Use `Calendar.current.date(byAdding:to:)` |
| `String` for sensitive secrets | Interned, can't wipe | Use `Data`, zero with `.resetBytes()` |
| `.frame(maxWidth: .infinity)` everywhere | Layout debugging hell | Use proper layout containers |
| Missing `Privacy Manifest` | App Store rejection | Include `PrivacyInfo.xcprivacy` for app + every framework |
| `UIApplication.shared` from SwiftUI | Bridging without env | Use `@Environment(\.openURL)`, etc. |
| Forgetting `task(id:)` when input changes | Stale data | Use `id` parameter to re-run task |

## Logging — os.Logger

```swift
import os

private let log = Logger(subsystem: "com.bhodl.wallet", category: "send")

log.info("Sending \(amount.sats, privacy: .public) sats to \(address, privacy: .private)")
log.error("Send failed: \(error.localizedDescription, privacy: .public)")
log.fault("Inconsistent state in tx engine")
```

`.privacy` levels: `.public`, `.private` (default), `.private(mask: .hash)`. Critical for wallet apps — never leak addresses, balances, or seed material in unredacted logs.

View logs in Console.app filtered by subsystem.

## Build & Tooling

```bash
# Build (Xcode CLI)
xcodebuild -scheme BHODL -configuration Release -sdk iphoneos build

# Test
xcodebuild test -scheme BHODL -destination 'platform=iOS Simulator,name=iPhone 15'

# Archive for App Store
xcodebuild -scheme BHODL archive -archivePath ./build/BHODL.xcarchive

# Export IPA
xcodebuild -exportArchive -archivePath ./build/BHODL.xcarchive \
    -exportPath ./build/ipa -exportOptionsPlist ExportOptions.plist
```

For SwiftPM-based packages:

```bash
swift build
swift test
swift package update
```

## Testing

### Swift Testing (Swift 6+ — recommended)

```swift
import Testing
@testable import BHODL

@Suite struct WalletStoreTests {
    @Test func loadsWalletsOnInit() async throws {
        let store = WalletStore(api: MockAPI(wallets: [.testWallet()]))
        await store.load()
        #expect(store.wallets.count == 1)
        #expect(store.error == nil)
    }

    @Test(arguments: [0, 1, 100, 1_000_000])
    func formatsAmount(sats: Int) {
        let formatted = formatSats(sats)
        #expect(!formatted.isEmpty)
    }
}
```

### XCTest (legacy, still widely used)

```swift
final class WalletStoreTests: XCTestCase {
    func testLoadsWallets() async throws {
        let store = WalletStore(api: MockAPI())
        await store.load()
        XCTAssertEqual(store.wallets.count, 1)
    }
}
```

### UI Tests (XCUITest)

```swift
final class BHODLUITests: XCTestCase {
    func testSendFlow() throws {
        let app = XCUIApplication()
        app.launch()

        app.buttons["Send"].tap()
        app.textFields["Bitcoin address"].typeText("bc1q...")
        app.buttons["Continue"].tap()

        XCTAssertTrue(app.staticTexts["Confirm"].waitForExistence(timeout: 2))
    }
}
```

For snapshot testing: **swift-snapshot-testing** (PointFree) — popular for SwiftUI views.

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Compose UI on iOS | `frontend-frameworks/compose-multiplatform` |
| Swift language patterns | `languages/swift` |
| Rust → Swift bindings | `languages/uniffi` |
| KMP shared module setup | `mobile/kotlin-multiplatform` |
| Detailed nav/sheets/state | [swiftui-architecture.md](quick-ref/swiftui-architecture.md) |
| Keychain access groups, SEP attestation | [secure-storage.md](quick-ref/secure-storage.md) |
| Background tasks, App Groups, Privacy Manifest | [system-integration.md](quick-ref/system-integration.md) |
