# Internationalization (i18n)

> Multi-language support, ICU message format, RTL layouts, number/date formatting, and translation workflows.

## Core Principles

1. **Externalize All Strings** — No hardcoded user-facing text. All strings come from translation files.
2. **ICU Message Format** — Use ICU for plurals, gender, and select patterns. Never concatenate translated strings.
3. **Locale-Aware Formatting** — Dates, numbers, and currencies must respect the users locale.

## Patterns

### Pattern 1: Message Catalog

```typescript
// messages/en.json
{ "greeting": "Hello, {name}!", "items": "{count, plural, =0 {No items} one {# item} other {# items}}" }

import { useTranslations } from "next-intl";
function Greeting({ name, count }: { name: string; count: number }) {
  const t = useTranslations();
  return <div><h1>{t("greeting", { name })}</h1><p>{t("items", { count })}</p></div>;
}
```

### Pattern 2: Locale-Aware Formatting

```typescript
function formatCurrency(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}
// formatCurrency(1234.56, "ar-SA", "SAR") → "١٬٢٣٤٫٥٦ ر.س."
```

### Pattern 3: RTL Support

```typescript
function useDirection(locale: string): "ltr" | "rtl" {
  const rtlLocales = ["ar", "he", "fa", "ur"];
  return rtlLocales.includes(locale.split("-")[0]) ? "rtl" : "ltr";
}
// <html dir={useDirection(locale)} lang={locale}>
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| String concatenation for translations | Word order differs across languages | Use ICU message format with placeholders |
| Hardcoded date formats | MM/DD/YYYY is US-only | Use Intl.DateTimeFormat with locale |
| Assuming LTR layout | Breaks Arabic, Hebrew, Farsi UIs | Use logical CSS properties (inline-start) |
| Machine translation only | Poor quality, cultural errors | Professional translation + review workflow |

## Implementation Checklist

- [ ] Set up next-intl or react-intl with ICU message format
- [ ] Externalize all user-facing strings to message catalogs
- [ ] Implement locale-aware number, date, and currency formatting
- [ ] Add RTL layout support with logical CSS properties
- [ ] Establish translation workflow (extract → translate → review → deploy)

## References

- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [MDN Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
