# iOS System Integration — Quick Reference

Background tasks, Universal Links, App Groups, Share Extensions, Privacy Manifest, StoreKit 2.

## Background Tasks (BGTaskScheduler)

For periodic background work (sync, fetch, processing). iOS heavily throttles — schedule "at earliest" but iOS decides.

### Setup

`Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>processing</string>
</array>

<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.bhodl.app.refresh</string>
    <string>com.bhodl.app.sync</string>
</array>
```

### Register

```swift
import BackgroundTasks

@main
struct BHODLApp: App {
    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.bhodl.app.refresh",
            using: nil
        ) { task in
            handleAppRefresh(task: task as! BGAppRefreshTask)
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.bhodl.app.sync",
            using: nil
        ) { task in
            handleProcessing(task: task as! BGProcessingTask)
        }
    }

    var body: some Scene { /* ... */ }
}
```

### Schedule

```swift
func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.bhodl.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)   // ≥15 min from now

    do {
        try BGTaskScheduler.shared.submit(request)
    } catch {
        print("Could not schedule: \(error)")
    }
}

func scheduleProcessing() {
    let request = BGProcessingTaskRequest(identifier: "com.bhodl.app.sync")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = false                          // true = only when charging

    try? BGTaskScheduler.shared.submit(request)
}
```

Call after work completes (e.g., on `.background` scene phase) to chain.

### Handle

```swift
func handleAppRefresh(task: BGAppRefreshTask) {
    // Re-schedule next refresh
    scheduleAppRefresh()

    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1

    let operation = SyncOperation()

    task.expirationHandler = {
        queue.cancelAllOperations()
    }

    operation.completionBlock = {
        task.setTaskCompleted(success: !operation.isCancelled)
    }

    queue.addOperation(operation)
}
```

### Limits

- App Refresh: ~30 sec, called best-effort
- Processing: ~few min, requires charging often
- iOS learns user habits — heavily-used apps get more background time
- Disabled if user disables Background App Refresh

### Testing

In Xcode debugger, type:

```
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.bhodl.app.refresh"]
```

Triggers task immediately for testing.

## Universal Links

HTTPS URLs that open your app instead of Safari (with fallback if app not installed).

### Setup

1. Add **Associated Domains** capability
2. `applinks:bhodl.app` entry

```xml
<!-- entitlements -->
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:bhodl.app</string>
</array>
```

3. Host `https://bhodl.app/.well-known/apple-app-site-association` (no extension):

```json
{
  "applinks": {
    "details": [{
      "appID": "TEAMID.com.bhodl.app",
      "paths": ["/wallet/*", "/tx/*", "NOT /admin/*"]
    }]
  }
}
```

4. Handle in SwiftUI:

```swift
struct ContentView: View {
    var body: some View {
        Text("App")
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                guard let url = activity.webpageURL else { return }
                handleDeepLink(url)
            }
            .onOpenURL { url in
                handleDeepLink(url)        // for custom URI schemes (bitcoin:, lightning:)
            }
    }

    func handleDeepLink(_ url: URL) {
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        switch url.path {
        case let path where path.hasPrefix("/wallet/"):
            let walletId = path.replacingOccurrences(of: "/wallet/", with: "")
            // navigate to wallet
        case let path where path.hasPrefix("/tx/"):
            let txId = path.replacingOccurrences(of: "/tx/", with: "")
            // navigate to tx
        default:
            break
        }
    }
}
```

### Custom URI Scheme

For `bitcoin:` and `lightning:` URIs:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.bhodl.bitcoin</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>bitcoin</string>
            <string>lightning</string>
        </array>
    </dict>
</array>
```

## App Groups (Share Data with Extensions)

Add capability + group ID:

```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.bhodl.shared</string>
</array>
```

### Shared UserDefaults

```swift
let shared = UserDefaults(suiteName: "group.com.bhodl.shared")
shared?.set("value", forKey: "key")

// In SwiftUI
@AppStorage("key", store: UserDefaults(suiteName: "group.com.bhodl.shared"))
var value: String = ""
```

### Shared File Storage

```swift
let url = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.bhodl.shared"
)
let file = url?.appendingPathComponent("data.json")
try data.write(to: file!)
```

### Shared Keychain

Add `keychain-access-groups` entitlement (see `secure-storage.md`).

## Share Extension

Allows other apps to share content (text, URLs, images) into your app.

1. File → New → Target → Share Extension
2. Configure `Info.plist` with content type filters:

```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsText</key>
            <true/>
            <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
            <integer>1</integer>
        </dict>
    </dict>
    <key>NSExtensionMainStoryboard</key>
    <string>MainInterface</string>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
</dict>
```

```swift
class ShareViewController: SLComposeServiceViewController {
    override func didSelectPost() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first else { return }

        provider.loadItem(forTypeIdentifier: "public.url", options: nil) { (item, error) in
            guard let url = item as? URL else { return }
            // Save URL to App Group container
            let shared = UserDefaults(suiteName: "group.com.bhodl.shared")
            shared?.set(url.absoluteString, forKey: "incoming_url")

            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }
}
```

Main app polls UserDefaults or uses Darwin notifications to detect new content.

## Privacy Manifest (App Store Required)

Since iOS 17, App Store requires `PrivacyInfo.xcprivacy` for app + every third-party framework that accesses sensitive APIs.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>

    <key>NSPrivacyTrackingDomains</key>
    <array/>

    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- declare collected data types -->
    </array>

    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>          <!-- App functionality -->
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

### Required-Reason API Categories

| Category | Reason codes (examples) |
|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | CA92.1 (app functionality), 1C8F.1 (sharing across processes) |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | C617.1 (display to user), 3B52.1 (third-party SDK) |
| `NSPrivacyAccessedAPICategorySystemBootTime` | 35F9.1 (measure user time), 8FFB.1 (calculate transit time) |
| `NSPrivacyAccessedAPICategoryDiskSpace` | 85F4.1 (write file when low), B728.1 (ensure space for downloads) |
| `NSPrivacyAccessedAPICategoryActiveKeyboards` | 3EC4.1 (custom keyboard) |

Missing entries → App Store rejection.

## StoreKit 2

Modern in-app purchase API (iOS 15+). Async/await, type-safe.

```swift
import StoreKit

final class StoreManager: NSObject {
    @Published var products: [Product] = []
    @Published var purchasedIDs: Set<String> = []

    private var transactionListener: Task<Void, Never>?

    init() {
        super.init()
        transactionListener = listenForTransactions()
    }

    func loadProducts(ids: [String]) async throws {
        products = try await Product.products(for: ids)
    }

    func purchase(_ product: Product) async throws -> Transaction? {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            return transaction
        case .userCancelled:
            return nil
        case .pending:
            return nil
        @unknown default:
            return nil
        }
    }

    func updatePurchases() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                purchasedIDs.insert(transaction.productID)
            }
        }
    }

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    await self.updatePurchases()
                }
            }
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified: throw StoreError.failedVerification
        case .verified(let safe): return safe
        }
    }
}

enum StoreError: Error {
    case failedVerification
}
```

For BHODL-style: probably skip StoreKit (open-source, no IAP). Donations go through Lightning, not Apple's payment rails.

## Push Notifications

Setup:
1. Capabilities → Push Notifications + Background Modes → Remote notifications
2. APNs auth key in Apple Developer Console
3. Request permission:

```swift
import UserNotifications

let center = UNUserNotificationCenter.current()
let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
if granted {
    await UIApplication.shared.registerForRemoteNotifications()
}
```

```swift
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        // send to server
    }
}
```

For SwiftUI App: bridge via `UIApplicationDelegateAdaptor`:

```swift
@main
struct BHODLApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene { WindowGroup { ContentView() } }
}
```

## Pitfalls

| Pitfall | Fix |
|---|---|
| BGTaskScheduler not firing | iOS throttles — test via Xcode debugger sim |
| Universal Link opens Safari | Verify AASA file (no extension, JSON, served HTTPS) |
| App Group access fails | Check entitlement spelled `group.*` exactly |
| Privacy Manifest missing for SDK | Even closed-source SDKs need them — check vendor |
| Push notifications work in dev, not prod | Different APNs environment — check `aps-environment` entitlement |
| Background work clobbered | Save state on `.background` scene phase |
| Universal Link not opening from same domain Safari tab | Long-press, "Open in App" |
| onOpenURL fires twice | Deduplicate by URL string |
| StoreKit verification fails locally | Use StoreKit Configuration File for testing |
| Privacy Manifest reasons miss new APIs | Re-audit after every iOS major release |
