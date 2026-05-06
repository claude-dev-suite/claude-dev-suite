---
name: maestro
description: |
  Maestro — declarative E2E mobile UI testing framework by mobile.dev. YAML-based
  flow files, single tool for Android + iOS (and Compose Multiplatform / Flutter /
  React Native). Built-in cloud runner, recording mode, JS scripting for complex
  assertions, screen state diffing, no flakiness from explicit waits.

  USE WHEN: user mentions "Maestro", "maestro test", "mobile E2E", "cross-platform UI test",
  "maestro studio", "mobile.dev cloud", ".maestro" folder, "launchApp" YAML

  DO NOT USE FOR: web E2E - use `testing/playwright`
  DO NOT USE FOR: unit tests - use `testing/kotest`, `testing/vitest`, etc.
  DO NOT USE FOR: instrumented Android tests - use Espresso/Compose Test
  DO NOT USE FOR: snapshot tests - use `testing/compose-snapshot`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Maestro — E2E Mobile Testing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `maestro`.

## Why Maestro

| Feature | Maestro | Espresso/XCUITest | Detox/Appium |
|---|---|---|---|
| Cross-platform (Android + iOS) | ✅ Single test | ❌ Separate per platform | ✅ |
| Test format | YAML (declarative) | Kotlin / Swift | JS |
| Implicit waits / retry | ✅ Built-in | ❌ Manual `waitFor` | Partial |
| Recording mode | ✅ Maestro Studio | ❌ | ❌ |
| Cloud runner | ✅ Free tier on mobile.dev | — | Sauce Labs / BrowserStack |
| Compose / Flutter / RN | ✅ All | Espresso for Compose / XCUITest | Detox: RN only |
| Setup time | < 5 min | hours | 30+ min |
| Flakiness | Low (smart waits) | High (timing) | Medium |

## Install

```bash
# macOS / Linux
curl -Ls "https://get.maestro.mobile.dev" | bash
# adds to ~/.maestro/bin

# Or via brew
brew tap mobile-dev-inc/tap
brew install maestro

# Windows
# Use WSL2 or Docker; native Windows support limited

# Verify
maestro --version
```

For iOS testing, also install:
```bash
brew install facebook/fb/idb-companion
```

## Project Layout

```
project-root/
├── .maestro/
│   ├── flows/
│   │   ├── onboarding.yaml
│   │   ├── send_bitcoin.yaml
│   │   ├── receive_bitcoin.yaml
│   │   └── settings.yaml
│   ├── helpers/
│   │   └── common.yaml          # reusable subFlow
│   └── config.yaml              # global config
├── apps/
│   ├── android/                 # APK builds
│   └── ios/                     # IPA builds
└── ...
```

## First Flow

`.maestro/flows/onboarding.yaml`:

```yaml
appId: com.bhodl.android
---
- launchApp:
    clearState: true              # fresh state every run
- assertVisible: "Welcome to BHODL"
- tapOn: "Get Started"
- assertVisible: "Create Wallet"
- tapOn: "Create new wallet"
- assertVisible:
    text: "Backup your seed"
    timeout: 5000
- tapOn:
    id: "btn_continue"
- inputText: "my-secure-passphrase"
- tapOn: "Confirm"
- assertVisible: "Wallet created"
```

Run:
```bash
maestro test .maestro/flows/onboarding.yaml

# Run all flows in folder
maestro test .maestro/flows/

# With env var substitution
maestro test -e API_BASE=https://staging.bhodl.app .maestro/flows/
```

## Cross-Platform appId

Same flow, different bundle IDs:

```yaml
appId: ${APP_ID}                  # set via env or config
---
- launchApp
```

```bash
APP_ID=com.bhodl.android maestro test flow.yaml
APP_ID=com.bhodl.ios.BHODL maestro test flow.yaml
```

Or `config.yaml`:
```yaml
appId: com.bhodl
flows:
  - flows/*.yaml
```

## Selectors

Maestro finds elements by text, id, accessibility label, or content description. Composable rules.

```yaml
- tapOn: "Send"                          # exact text match
- tapOn:
    text: "Send"                         # explicit text matcher
- tapOn:
    id: "send_button"                    # by accessibility id (Android: contentDescription, iOS: accessibilityIdentifier)
- tapOn:
    text: "Send"
    index: 0                             # if multiple matches
- tapOn:
    text: ".*coin.*"                     # regex
- tapOn:
    point: "50%, 50%"                    # screen coordinates
- tapOn:
    below: "Recipient"                   # spatial relations
- tapOn:
    leftOf: "Cancel"
- tapOn:
    enabled: true                        # filter by state
    text: "Continue"
```

For Compose/SwiftUI testability:

```kotlin
// Compose
Button(
    onClick = { /* ... */ },
    modifier = Modifier.testTag("send_button"),    // accessible to Maestro as id
) { Text("Send") }

// SwiftUI
Button("Send") { /* ... */ }
    .accessibilityIdentifier("send_button")
```

## Common Actions

```yaml
- launchApp:
    clearState: true               # fresh app state
    clearKeychain: true            # iOS keychain wipe
    arguments:
        debug: true
    permissions:
        camera: allow              # auto-grant on launch (iOS 14+, Android)
        location: deny

- tapOn: "Button"
- doubleTapOn: "Item"
- longPressOn: "Item"
- swipe:
    from: "30%, 50%"
    to: "70%, 50%"
- swipe:
    direction: UP
- scroll                            # default scroll
- scrollUntilVisible:
    element: "End of list"
    direction: DOWN

- inputText: "hello"
- copyTextFrom: "Address field"     # to clipboard
- pasteText                         # from clipboard (iOS only)
- eraseText: 10                     # delete N chars
- hideKeyboard

- pressKey: BACK                    # Android back button
- pressKey: ENTER

- openLink: "bitcoin:bc1q..."       # deep link
- openBrowser: "https://example.com"
- back

- waitForAnimationToEnd:
    timeout: 5000

- takeScreenshot: "after_send"
- assertVisible: "Sent successfully"
- assertNotVisible: "Error"
- assertTrue: "${output.success == true}"
```

## SubFlows (Reusable)

`helpers/login.yaml`:
```yaml
appId: com.bhodl.android
---
- inputText: ${USERNAME}
- tapOn:
    id: "password_field"
- inputText: ${PASSWORD}
- tapOn: "Login"
```

Use:
```yaml
- runFlow:
    file: ../helpers/login.yaml
    env:
        USERNAME: alice@example.com
        PASSWORD: secret
- assertVisible: "Welcome, Alice"
```

## Conditionals & Loops

```yaml
- runFlow:
    when:
        visible: "Permission required"
    commands:
        - tapOn: "Allow"

- runFlow:
    when:
        notVisible: "Already onboarded"
    commands:
        - runFlow: ../helpers/onboarding.yaml

- repeat:
    times: 3
    commands:
        - tapOn: "Refresh"
        - waitForAnimationToEnd

- repeat:
    while:
        visible: "Loading..."
    commands:
        - waitForAnimationToEnd:
            timeout: 1000
```

## JavaScript Scripting

For complex assertions or test data generation:

```yaml
- runScript: scripts/generate_address.js
    env:
        NETWORK: testnet
- inputText: ${output.address}
```

`scripts/generate_address.js`:
```js
output.address = generateAddress(env.NETWORK);

function generateAddress(network) {
    return network === "testnet" ? "tb1q..." : "bc1q...";
}
```

Or inline:
```yaml
- evalScript: ${output.balance = parseFloat(output.amount) * 100000000}
- assertTrue: ${output.balance > 0}
```

## Tags & Filtering

```yaml
tags:
    - smoke
    - critical
appId: com.bhodl.android
---
- launchApp
```

```bash
# Run only smoke tests
maestro test .maestro/flows/ --include-tags smoke

# Exclude slow tests
maestro test .maestro/flows/ --exclude-tags slow
```

## Maestro Studio (Recording / Inspection)

Interactive UI for crafting tests:

```bash
maestro studio
```

Opens browser at `http://localhost:9999`. Connects to running emulator/device. You can:
- Inspect element tree
- Tap elements to generate YAML
- Record test session
- Try selectors live
- Export to YAML flow

Use to bootstrap tests, then refine in code.

## Cloud Runner (mobile.dev)

```bash
# Run tests on cloud devices
maestro cloud --apiKey=$MAESTRO_API_KEY \
    apps/android/app-debug.apk \
    .maestro/flows/

# iOS
maestro cloud --apiKey=$MAESTRO_API_KEY \
    apps/ios/build/BHODL.app \
    .maestro/flows/
```

Free tier: limited monthly minutes. Paid tier for parallel runs, more devices, screenshots/videos retention.

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/e2e.yml
name: Maestro E2E
on: [pull_request]

jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }

      - name: Build APK
        run: ./gradlew :apps:android:assembleDebug

      - name: Setup Maestro
        run: |
            curl -Ls "https://get.maestro.mobile.dev" | bash
            echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          arch: x86_64
          script: |
            adb install apps/android/app/build/outputs/apk/debug/app-debug.apk
            maestro test .maestro/flows/

  ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: Build app for simulator
        run: |
            xcodebuild -scheme BHODL -sdk iphonesimulator \
              -destination 'platform=iOS Simulator,name=iPhone 15' build

      - name: Setup Maestro
        run: |
            curl -Ls "https://get.maestro.mobile.dev" | bash
            echo "$HOME/.maestro/bin" >> $GITHUB_PATH
            brew install facebook/fb/idb-companion

      - run: maestro test .maestro/flows/
```

### Cloud Mode (Simpler CI)

```yaml
- name: Run on Maestro Cloud
  run: |
    maestro cloud --apiKey=${{ secrets.MAESTRO_API_KEY }} \
        apps/android/app-debug.apk \
        .maestro/flows/
```

No emulator setup needed.

## Test Patterns for Wallet Apps

### Send transaction (mocked backend)

```yaml
appId: com.bhodl.android
---
- launchApp:
    clearState: true
- runFlow: ../helpers/restore_test_wallet.yaml

- tapOn: "Send"
- inputText: "tb1q...test_address"
- tapOn:
    id: "amount_field"
- inputText: "1000"
- tapOn: "Continue"

- assertVisible: "Confirm send"
- assertVisible: "1000 sats"
- assertVisible:
    text: "tb1q.*"

- tapOn: "Confirm"
- tapOn: "Authenticate"            # biometric prompt — needs special handling

# Biometric: in regtest/staging build, replace with bypass button
- tapOn: "Use test biometric"

- assertVisible:
    text: "Sent successfully"
    timeout: 30000

- takeScreenshot: "after_send"
```

### Backup & restore flow

```yaml
appId: com.bhodl.android
---
- launchApp:
    clearState: true

# Create wallet, get seed
- tapOn: "Create new wallet"
- copyTextFrom:
    id: "seed_phrase"
- evalScript: ${output.seed = maestro.copiedText}
- tapOn: "I've backed up"

# Wipe and restore
- launchApp:
    clearState: true
- tapOn: "Restore wallet"
- inputText: ${output.seed}
- tapOn: "Restore"

- assertVisible: "Wallet restored"
- assertVisible: "Balance: 0 sats"
```

## Biometric / Permission Handling

Maestro can grant permissions on launch:

```yaml
- launchApp:
    permissions:
        camera: allow
        location: deny
        notifications: allow
```

For biometric, build a **debug-only test mode** in your app that accepts a fixed test PIN instead of real biometric — Maestro can't simulate Face/Touch ID prompts.

```kotlin
// Android
class BiometricAuthHelper {
    fun authenticate(callback: (Boolean) -> Unit) {
        if (BuildConfig.DEBUG && System.getenv("MAESTRO_TEST") == "1") {
            callback(true)                                // bypass for E2E
            return
        }
        // real biometric prompt
    }
}
```

## Performance & Best Practices

- **Idempotent flows** — `clearState: true` ensures predictable starting point
- **Avoid timing-dependent waits** — Maestro auto-retries; use `assertVisible: { timeout: 10000 }` only when needed
- **Use `id`/accessibility** over text where possible — survives copy changes and i18n
- **Tag flows by speed/criticality** — run smoke on every PR, full suite nightly
- **Screenshot key states** — `takeScreenshot` for visual diff in cloud
- **Wallet apps**: use a regtest/signet backend — no real money, predictable balances

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Hardcoded sleeps (`waitForAnimationToEnd: { timeout: 30000 }`) | Slow + brittle | Use `assertVisible` (auto-retries) |
| Selecting by absolute coordinates | Breaks across screen sizes | Use text/id/spatial selectors |
| Real biometric in CI | Can't automate | Debug bypass + Maestro test flag |
| Flow that depends on previous flow's state | Brittle | `clearState: true` + helper subFlows |
| Hardcoded test data (specific addresses) | Breaks on env change | Use env vars / setup helpers |
| No screenshots on failure | Hard to debug | `takeScreenshot` at key checkpoints |
| Running all flows on every PR | Slow CI | Tag and run subset on PR, full nightly |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Element not found" but visible | Wrong selector hierarchy | Use Maestro Studio to inspect tree |
| Flaky tests in CI | Animation overlap | Add `waitForAnimationToEnd` between actions |
| iOS app not launching | Wrong bundle ID or app not installed | Verify with `xcrun simctl listapps booted` |
| Android app crashes on launch | Wrong APK arch (x86_64 vs arm) | Build matching emulator arch |
| Permission dialog appearing | Permissions not pre-granted | Use `launchApp.permissions:` |
| Maestro Studio black screen | Emulator/device not connected | `adb devices` / `xcrun simctl list` |
| Slow flow execution | Many `waitForAnimationToEnd` | Replace with `assertVisible` |
| `idb_companion` errors on macOS | Outdated companion | `brew upgrade idb-companion` |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Web E2E | `testing/playwright` |
| Compose unit/integration tests | `mobile/jetpack-compose` (testing section) |
| Compose snapshot tests | `testing/compose-snapshot` |
| Espresso / XCUITest specifics | Native test frameworks |
| Detox (React Native) | Detox-specific docs |
| Pure Kotlin unit tests | `testing/kotest` |
