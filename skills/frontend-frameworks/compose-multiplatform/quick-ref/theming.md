# CMP Theming — Quick Reference

Material 3 design system + how to override with custom design tokens (multi-brand, dark mode, dynamic color).

## Material 3 Defaults

```kotlin
@Composable
fun App() {
    MaterialTheme {
        // automatic light/dark via system
        Surface { /* content */ }
    }
}
```

Material 3 picks light/dark based on `isSystemInDarkTheme()`. Override:

```kotlin
@Composable
fun App() {
    val darkTheme = false   // or read from preferences
    MaterialTheme(
        colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme(),
    ) { /* content */ }
}
```

## Custom Color Scheme

```kotlin
private val LightColors = lightColorScheme(
    primary = Color(0xFFFF9500),                // BHODL orange
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE0B2),
    onPrimaryContainer = Color(0xFF3F1F00),

    secondary = Color(0xFF6B5D4F),
    onSecondary = Color.White,

    background = Color(0xFFFAFAFA),
    onBackground = Color(0xFF1C1B1F),

    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1C1B1F),
    surfaceVariant = Color(0xFFEFEFEF),

    error = Color(0xFFB00020),
    onError = Color.White,

    outline = Color(0xFFCAC4D0),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB740),
    onPrimary = Color(0xFF3F1F00),
    primaryContainer = Color(0xFF6B4400),
    onPrimaryContainer = Color(0xFFFFE0B2),

    background = Color(0xFF121212),
    onBackground = Color(0xFFE6E1E5),

    surface = Color(0xFF1F1F1F),
    onSurface = Color(0xFFE6E1E5),
)

@Composable
fun BhodlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = bhodlTypography,
        shapes = bhodlShapes,
        content = content,
    )
}
```

Use **Material Theme Builder** (https://m3.material.io/theme-builder) to generate full color schemes from a seed color.

## Typography

```kotlin
val bhodlTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = interFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.25).sp,
    ),
    displayMedium = TextStyle(/* ... */),
    headlineLarge = TextStyle(
        fontFamily = interFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 40.sp,
    ),
    titleLarge = TextStyle(/* ... */),
    bodyLarge = TextStyle(
        fontFamily = interFontFamily,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(/* ... */),
    labelLarge = TextStyle(/* ... */),
    // ... fill in all 15 type styles
)
```

Material 3 has 15 type styles across Display/Headline/Title/Body/Label × Large/Medium/Small. Override only the ones you customize.

### Loading Custom Fonts

```kotlin
import org.jetbrains.compose.resources.Font
import androidx.compose.runtime.Composable

@Composable
fun bhodlFontFamily(): FontFamily = FontFamily(
    Font(Res.font.inter_regular, FontWeight.Normal),
    Font(Res.font.inter_medium, FontWeight.Medium),
    Font(Res.font.inter_semibold, FontWeight.SemiBold),
    Font(Res.font.inter_bold, FontWeight.Bold),
)

@Composable
fun bhodlTypography(): Typography {
    val family = bhodlFontFamily()
    return Typography(
        bodyLarge = TextStyle(fontFamily = family, fontSize = 16.sp),
        // ...
    )
}

@Composable
fun BhodlTheme(...) {
    MaterialTheme(typography = bhodlTypography(), ...) { ... }
}
```

Font files in `shared/src/commonMain/composeResources/font/` (TTF or OTF).

## Shapes

```kotlin
val bhodlShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)
```

Used by Material components automatically (`Card` → `medium`, `Button` → `extraLarge`, etc.).

## Custom Tokens (Beyond Material)

For design systems with tokens Material doesn't cover (gradient backgrounds, custom spacings, semantic colors specific to your domain), define a custom theme:

```kotlin
// Custom token data classes
@Immutable
data class BhodlSpacing(
    val xxs: Dp = 2.dp,
    val xs: Dp = 4.dp,
    val sm: Dp = 8.dp,
    val md: Dp = 16.dp,
    val lg: Dp = 24.dp,
    val xl: Dp = 32.dp,
    val xxl: Dp = 48.dp,
)

@Immutable
data class BhodlSemanticColors(
    val success: Color,
    val warning: Color,
    val info: Color,
    val onSuccess: Color,
    val pending: Color,
    val confirmed: Color,
)

val LocalSpacing = staticCompositionLocalOf { BhodlSpacing() }
val LocalSemanticColors = staticCompositionLocalOf<BhodlSemanticColors> {
    error("BhodlSemanticColors not provided")
}

@Composable
fun BhodlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val semantic = if (darkTheme) BhodlSemanticColors(
        success = Color(0xFF66BB6A),
        warning = Color(0xFFFFB74D),
        info = Color(0xFF64B5F6),
        onSuccess = Color.Black,
        pending = Color(0xFFBBDEFB),
        confirmed = Color(0xFF81C784),
    ) else BhodlSemanticColors(
        success = Color(0xFF388E3C),
        warning = Color(0xFFF57C00),
        info = Color(0xFF1976D2),
        onSuccess = Color.White,
        pending = Color(0xFF1565C0),
        confirmed = Color(0xFF2E7D32),
    )

    CompositionLocalProvider(
        LocalSpacing provides BhodlSpacing(),
        LocalSemanticColors provides semantic,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            typography = bhodlTypography,
            shapes = bhodlShapes,
            content = content,
        )
    }
}

// Convenience accessors
object BhodlTheme {
    val spacing: BhodlSpacing
        @Composable get() = LocalSpacing.current

    val semanticColors: BhodlSemanticColors
        @Composable get() = LocalSemanticColors.current
}

// Usage
@Composable
fun TransactionItem(tx: Transaction) {
    Card(
        modifier = Modifier.padding(BhodlTheme.spacing.md),
    ) {
        Text(
            text = "Confirmed",
            color = BhodlTheme.semanticColors.confirmed,
        )
    }
}
```

## Dynamic Color (Android 12+ only)

Material You / dynamic color is Android-only:

```kotlin
@Composable
fun App() {
    val colors = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (isSystemInDarkTheme())
            dynamicDarkColorScheme(LocalContext.current)
        else
            dynamicLightColorScheme(LocalContext.current)
    } else {
        if (isSystemInDarkTheme()) DarkColors else LightColors
    }

    MaterialTheme(colorScheme = colors) { /* ... */ }
}
```

For KMP, expose via expect/actual:

```kotlin
// commonMain
expect fun dynamicColorScheme(darkTheme: Boolean): ColorScheme?

// androidMain — return scheme on API 31+
// iosMain / desktopMain — return null (not supported)
```

## Multi-Brand / Multi-Tenant

```kotlin
@Immutable
data class BrandTokens(
    val primaryColor: Color,
    val logoResource: DrawableResource,
    val name: String,
)

val BrandBhodl = BrandTokens(
    primaryColor = Color(0xFFFF9500),
    logoResource = Res.drawable.logo_bhodl,
    name = "BHODL",
)

val BrandHodlrr = BrandTokens(
    primaryColor = Color(0xFF8E44AD),
    logoResource = Res.drawable.logo_hodlrr,
    name = "HODLRR",
)

val LocalBrand = staticCompositionLocalOf<BrandTokens> {
    error("Brand not provided")
}

@Composable
fun BrandedTheme(brand: BrandTokens, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalBrand provides brand) {
        MaterialTheme(
            colorScheme = lightColorScheme(primary = brand.primaryColor),
            content = content,
        )
    }
}
```

## Dark Mode Toggle

```kotlin
class ThemePreferences(private val settings: Settings) {
    private val _isDark = MutableStateFlow(settings.getBoolean("dark_mode", false))
    val isDark: StateFlow<Boolean> = _isDark.asStateFlow()

    fun toggle() {
        _isDark.value = !_isDark.value
        settings.putBoolean("dark_mode", _isDark.value)
    }
}

@Composable
fun App(prefs: ThemePreferences) {
    val isDark by prefs.isDark.collectAsState()
    BhodlTheme(darkTheme = isDark) {
        AppContent(onToggleDark = { prefs.toggle() })
    }
}
```

For "follow system / always light / always dark", expose tri-state:

```kotlin
enum class ThemeMode { System, Light, Dark }

@Composable
fun BhodlTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val darkTheme = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
```

## Accessibility & High Contrast

Provide alternate color schemes for high contrast:

```kotlin
val HighContrastDarkColors = darkColorScheme(
    primary = Color.White,
    onPrimary = Color.Black,
    surface = Color.Black,
    onSurface = Color.White,
    // maximize WCAG AAA contrast
)

@Composable
fun BhodlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    highContrast: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = when {
        highContrast && darkTheme -> HighContrastDarkColors
        highContrast -> HighContrastLightColors
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, content = content)
}
```

## Color Helpers

```kotlin
// Lighten / darken
fun Color.lighten(amount: Float): Color =
    copy(
        red = (red + amount).coerceIn(0f, 1f),
        green = (green + amount).coerceIn(0f, 1f),
        blue = (blue + amount).coerceIn(0f, 1f),
    )

// Alpha overlay (Material 3 elevation tinting)
fun Color.applyTonalOverlay(elevation: Dp): Color {
    val alpha = ((4.5 * ln(elevation.value + 1)) + 2) / 100
    return copy(alpha = alpha.toFloat())
}
```

## Testing Theme Across Variants

```kotlin
@Preview  // Compose Multiplatform preview (limited support outside Android Studio)
@Composable
fun ButtonPreview() {
    BhodlTheme(darkTheme = false) { Button(onClick = {}) { Text("Light") } }
    BhodlTheme(darkTheme = true) { Button(onClick = {}) { Text("Dark") } }
}
```

For full visual regression, use Paparazzi (JVM) for Android-side testing of shared composables.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Hardcoded `Color(0xFF...)` in composables | Breaks theming | Use `MaterialTheme.colorScheme.primary` |
| Reading theme outside `@Composable` | No theme context | Pass colors as parameters or use `CompositionLocalProvider` |
| Per-screen `MaterialTheme` blocks | Inconsistent | Single root theme, override only when needed |
| `MaterialTheme.colors.primary` (Material 2 syntax) | Wrong — outdated | Use Material 3 `MaterialTheme.colorScheme.primary` |
| Custom `compositionLocalOf` without `error("...")` default | Silent failure | Always provide default or throw |
| Light/dark in single mutable state without `remember` | Lost on recomposition | Hoist to ViewModel/ScreenModel |

## Troubleshooting

| Issue | Fix |
|---|---|
| Colors look wrong in dark mode | Verify both `lightColorScheme` and `darkColorScheme` defined; check `isSystemInDarkTheme()` |
| Custom font not loading | Check resource path, font weights match `Font(weight=...)` |
| Theme doesn't update on toggle | State must be in `remember` / hoisted, not in `MaterialTheme` block directly |
| Material 3 components look "default" | Pass full `colorScheme` not just primary |
| Status bar color wrong (Android) | Use `WindowCompat.setDecorFitsSystemWindows(window, false)` + `Surface(color = MaterialTheme.colorScheme.background)` |
| Status bar color wrong (iOS) | Implement custom `UIViewController` returning `preferredStatusBarStyle` |
