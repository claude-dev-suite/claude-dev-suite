# Compose ↔ Android Views Interop

How to embed Views in Compose, embed Compose in View-based screens, use Activity Result Contracts, and integrate with Fragments.

## AndroidView (View → Compose)

```kotlin
@Composable
fun MapView(latLng: LatLng, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            MapView(context).apply {
                onCreate(null)
                onResume()
            }
        },
        update = { mapView ->
            mapView.getMapAsync { map ->
                map.moveCamera(CameraUpdateFactory.newLatLng(latLng))
            }
        },
        onRelease = { mapView ->
            mapView.onPause()
            mapView.onDestroy()
        },
    )
}
```

| Param | Purpose |
|---|---|
| `factory` | Create the View — runs once |
| `update` | Re-applies on each recomposition based on State |
| `onRelease` | Cleanup when Composable leaves composition |
| `onReset` | Reset when reused in different position (rare) |

For lightweight Views: skip `onRelease` if no resources to clean up.

## AndroidViewBinding

For inflating XML layouts:

```kotlin
@Composable
fun LegacyForm(modifier: Modifier = Modifier) {
    AndroidViewBinding(
        modifier = modifier,
        factory = LegacyFormBinding::inflate,
    ) {
        editName.setText("Alice")
        btnSubmit.setOnClickListener { /* ... */ }
    }
}
```

Requires View Binding enabled in `build.gradle.kts`:

```kotlin
android {
    buildFeatures { viewBinding = true }
}
```

## ComposeView (Compose → View)

In a View-based Activity/Fragment:

```kotlin
class LegacyActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_legacy)

        findViewById<ComposeView>(R.id.compose_view).setContent {
            BhodlTheme {
                BalanceCard(balance = 100_000)
            }
        }
    }
}
```

XML:

```xml
<androidx.compose.ui.platform.ComposeView
    android:id="@+id/compose_view"
    android:layout_width="match_parent"
    android:layout_height="wrap_content" />
```

For mixed XML+Compose, use `ComposeView.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)` to control disposal.

## Fragments + Compose

```kotlin
class WalletFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = ComposeView(requireContext()).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            BhodlTheme {
                WalletScreen()
            }
        }
    }
}
```

`DisposeOnViewTreeLifecycleDestroyed` strategy is correct for Fragments — composables disposed when Fragment view is destroyed.

## Activity Result Contracts

Modern replacement for `startActivityForResult()`. Type-safe contracts.

### Permission

```kotlin
@Composable
fun CameraScreen() {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted ->
            if (granted) startCamera() else showRationale()
        },
    )

    Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) {
        Text("Open Camera")
    }
}
```

### Multiple Permissions

```kotlin
val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestMultiplePermissions(),
    onResult = { results: Map<String, Boolean> ->
        val cameraGranted = results[Manifest.permission.CAMERA] == true
        val locationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true
    },
)

launcher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION))
```

### Pick File / Image

```kotlin
val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.GetContent(),
    onResult = { uri: Uri? ->
        uri?.let { /* read file */ }
    },
)

launcher.launch("image/*")
```

For Photo Picker (Android 13+, recommended):

```kotlin
val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.PickVisualMedia(),
    onResult = { uri: Uri? -> /* ... */ },
)

launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```

### Take Picture

```kotlin
val takePictureLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.TakePicture(),
    onResult = { success: Boolean ->
        if (success) processImage(targetUri)
    },
)

takePictureLauncher.launch(targetUri)   // pre-allocated Uri (e.g., FileProvider)
```

### Custom Contract

```kotlin
class ScanQrContract : ActivityResultContract<Unit, String?>() {
    override fun createIntent(context: Context, input: Unit): Intent =
        Intent(context, QrScannerActivity::class.java)

    override fun parseResult(resultCode: Int, intent: Intent?): String? =
        if (resultCode == Activity.RESULT_OK) intent?.getStringExtra("qr_text") else null
}

@Composable
fun QrScanButton(onScan: (String) -> Unit) {
    val launcher = rememberLauncherForActivityResult(
        contract = ScanQrContract(),
        onResult = { result -> result?.let(onScan) },
    )

    Button(onClick = { launcher.launch(Unit) }) { Text("Scan QR") }
}
```

## Intents and System Actions

### Open URL

```kotlin
@Composable
fun ExternalLinkButton(url: String) {
    val context = LocalContext.current
    Button(onClick = {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }) { Text("Open") }
}
```

### Share Text

```kotlin
@Composable
fun ShareButton(text: String) {
    val context = LocalContext.current
    Button(onClick = {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(intent, null))
    }) { Text("Share") }
}
```

### Share Bitcoin URI

```kotlin
fun shareBitcoinUri(context: Context, address: String, amountSats: Long? = null) {
    val uri = buildString {
        append("bitcoin:$address")
        amountSats?.let {
            val btc = it.toDouble() / 100_000_000
            append("?amount=$btc")
        }
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, uri)
    }
    context.startActivity(Intent.createChooser(intent, "Send via..."))
}
```

## Lifecycle Integration

### Lifecycle-aware coroutine

```kotlin
class WalletFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state -> /* ... */ }
            }
        }
    }
}
```

Inside Compose, use `collectAsStateWithLifecycle()` for the same effect declaratively.

## Window Insets / Edge-to-Edge

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()                                           // Activity 1.8+
        setContent {
            BhodlTheme {
                Scaffold(
                    modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing),
                ) { padding ->
                    AppNavHost(modifier = Modifier.padding(padding))
                }
            }
        }
    }
}
```

`WindowInsets` flavors:
- `safeDrawing` — avoid status bar, nav bar, IME, cutouts
- `safeContent` — like safeDrawing + waterfall (curved edges)
- `safeGestures` — system gesture areas
- `statusBars`, `navigationBars`, `ime`, `displayCutout` — individual

For dynamic IME (keyboard) handling:

```kotlin
@Composable
fun ChatInput() {
    Column(modifier = Modifier.imePadding()) {
        // input field that shifts up when keyboard opens
    }
}
```

## CompositionLocal + Android

```kotlin
val LocalSnackbar = compositionLocalOf<SnackbarHostState> {
    error("SnackbarHostState not provided")
}

@Composable
fun App() {
    val snackbarHost = remember { SnackbarHostState() }

    CompositionLocalProvider(LocalSnackbar provides snackbarHost) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHost) },
        ) { /* ... */ }
    }
}

// Use anywhere
@Composable
fun ShowMessage(text: String) {
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    Button(onClick = {
        scope.launch { snackbar.showSnackbar(text) }
    }) { Text("Show") }
}
```

Built-in Compose locals on Android:
- `LocalContext`, `LocalConfiguration`, `LocalDensity`
- `LocalLifecycleOwner`, `LocalView`, `LocalLayoutDirection`
- `LocalFocusManager`, `LocalSoftwareKeyboardController`
- `LocalUriHandler`, `LocalClipboardManager`

## Pitfalls

| Pitfall | Fix |
|---|---|
| `AndroidView` calling `update` heavily | Move heavy work to factory or condition on State |
| Forgetting `setViewCompositionStrategy` in Fragments | Composables leak; use `DisposeOnViewTreeLifecycleDestroyed` |
| `findViewById` in composable | Use `AndroidView` properly with `factory`/`update` |
| `startActivityForResult` (deprecated) | Use `rememberLauncherForActivityResult` |
| Permissions checked only once | Always `launchPermissionRequest()` (system handles caching) |
| Missing `FileProvider` for camera Uri | Configure in manifest + provider_paths.xml |
| `LocalContext.current as Activity` | Crashes in previews — use `?.findActivity()` extension |
| Mixing View animations with Compose animations | Pick one — Compose has its own animation API |
| Manual `addObserver`/`removeObserver` | Use `LifecycleEventEffect` instead |
