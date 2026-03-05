---
name: i18n
description: |
  Internationalization and localization. i18next (React, Node.js), next-intl,
  vue-i18n, ICU message format, pluralization, date/number formatting,
  and RTL support.

  USE WHEN: user mentions "i18n", "internationalization", "localization", "l10n",
  "i18next", "translation", "next-intl", "vue-i18n", "ICU format", "RTL"

  DO NOT USE FOR: character encoding - general programming;
  currency/payment formatting - use `stripe`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Internationalization (i18n)

## i18next (React — recommended)

```typescript
// i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    ns: ['common', 'auth'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

```tsx
// Usage in components
import { useTranslation } from 'react-i18next';

function Welcome() {
  const { t } = useTranslation();

  return (
    <>
      <h1>{t('welcome', { name: 'John' })}</h1>
      <p>{t('items_count', { count: 5 })}</p>
    </>
  );
}
```

### Translation Files

```json
// locales/en/common.json
{
  "welcome": "Welcome, {{name}}!",
  "items_count_one": "{{count}} item",
  "items_count_other": "{{count}} items"
}

// locales/it/common.json
{
  "welcome": "Benvenuto, {{name}}!",
  "items_count_one": "{{count}} elemento",
  "items_count_other": "{{count}} elementi"
}
```

## next-intl (Next.js)

```typescript
// i18n/request.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../messages/${locale}.json`)).default,
}));
```

```tsx
import { useTranslations } from 'next-intl';

function Page() {
  const t = useTranslations('HomePage');
  return <h1>{t('title')}</h1>;
}
```

## Date & Number Formatting

```typescript
// Use Intl API (built-in, no library needed)
const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  year: 'numeric', month: 'long', day: 'numeric',
});
dateFormatter.format(new Date()); // "5. Marz 2026"

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
});
currencyFormatter.format(42.5); // "$42.50"

// Relative time
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
rtf.format(-1, 'day'); // "yesterday"
```

## ICU Message Format

```json
{
  "greeting": "{gender, select, male {Mr.} female {Ms.} other {Mx.}} {name}",
  "notifications": "{count, plural, =0 {No notifications} one {# notification} other {# notifications}}"
}
```

## Translation File Structure

```
locales/
├── en/
│   ├── common.json      # Shared strings
│   ├── auth.json         # Auth-specific
│   └── errors.json       # Error messages
├── it/
│   ├── common.json
│   ├── auth.json
│   └── errors.json
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Hardcoded strings in UI | Extract all user-facing text to translation files |
| String concatenation for sentences | Use interpolation (`{{name}}`) or ICU format |
| Manual pluralization logic | Use built-in plural rules (`_one`, `_other`) |
| Date formatting with string manipulation | Use `Intl.DateTimeFormat` |
| No fallback language | Always set `fallbackLng` |
| Giant single translation file | Split by namespace (common, auth, errors) |

## Production Checklist

- [ ] All user-facing strings externalized
- [ ] Pluralization rules for all supported languages
- [ ] Date/number formatting with `Intl` API
- [ ] RTL layout support (if applicable)
- [ ] Language detection (browser, user preference)
- [ ] Translation workflow with translators
- [ ] Missing key detection in CI
