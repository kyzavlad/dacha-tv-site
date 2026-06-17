# n8n compatibility — lavender booking webhook

The website now sends a **complete, normalized** lavender booking payload to
`WEBHOOK_URL`. Most fields are ready-to-display, so the n8n workflow needs almost
no calculation.

## Payload the website sends (POST JSON)

```json
{
  "type": "lavender_booking",
  "source": "website",
  "name": "Яніна",
  "phone": "0991993543",
  "product": "Оренда лавандового поля",
  "service_name": "Оренда лавандового поля",
  "page_url": "https://www.dachatv.com/lavender",
  "slug": "orenda-lavandovoho-polia",
  "date": "2026-06-28",
  "time": "18:00",
  "time_end": "21:00",
  "duration_hours": 3,
  "guest_count": 6,
  "guests": 6,
  "included_guests": 5,
  "extra_guests": 1,
  "extra_guests_total": 200,
  "bouquet_quantity": 2,
  "bouquet_unit_price": 100,
  "bouquet_total": 200,
  "base_total": 3600,
  "total_price": 4000,
  "timing": "2026-06-28 · 18:00–21:00 · 3 год.",
  "timing_text": "2026-06-28 · 18:00–21:00 · 3 год.",
  "guests_text": "6 осіб (включено 5, додатково +1)",
  "bouquet_line": "Букети лаванди: 2 шт × 100 ₴ = 200 ₴",
  "message": null,
  "comment": null,
  "created_at": "..."
}
```

> Price note: base = sum of each hourly slot (06:00–14:00 = 1000 ₴, 15:00–20:00 =
> 1200 ₴). `total_price = base_total + extra_guests_total + bouquet_total`.

## Fix 1 (preferred) — Edit Fields node

The **Edit Fields** node drops anything not explicitly mapped. Add these fields
(Keep Only Set = off, or add each one) so they survive to the Code node:

```
type, source, name, phone, product, service_name, page_url, slug,
date, time, time_end, duration_hours,
guest_count, guests, included_guests, extra_guests, extra_guests_total,
bouquet_quantity, bouquet_unit_price, bouquet_total, base_total, total_price,
timing, timing_text, guests_text, bouquet_line, message, comment
```

Simplest: set **Edit Fields → "Include Other Input Fields" = true** so nothing is
dropped.

## Fix 2 — replacement "Normalize Booking Payload" Code node

The old code clamped guests to 1–5 and assumed no extra guests. Replace it with
this (it trusts the website's already-built strings and only falls back if they
are missing):

```js
// n8n Code node — Normalize Booking Payload (lavender)
const d = $json;

const time = d.time || '';
const timeEnd = d.time_end || '';
const duration = Number(d.duration_hours || 1);
const guestCount = Number(d.guest_count ?? d.guests ?? 1) || 1;
const included = Number(d.included_guests ?? 5);
const extra = Number(d.extra_guests ?? Math.max(0, guestCount - included));
const bouquetQty = Number(d.bouquet_quantity ?? d.bouquet_qty ?? 0);
const bouquetUnit = Number(d.bouquet_unit_price ?? 100);
const bouquetTotal = Number(d.bouquet_total ?? bouquetQty * bouquetUnit);
const total = Number(d.total_price ?? d.total_price_uah ?? 0);

const word = (n) => (n === 1 ? 'особа' : n >= 2 && n <= 4 ? 'особи' : 'осіб');

const timingText = d.timing_text || d.timing ||
  `${d.date} · ${time}–${timeEnd} · ${duration} год.`;

const guestsText = d.guests_text || (extra > 0
  ? `${guestCount} ${word(guestCount)} (включено ${included}, додатково +${extra})`
  : `${guestCount} ${word(guestCount)}`);

const bouquetLine = d.bouquet_line || (bouquetQty > 0
  ? `Букети лаванди: ${bouquetQty} шт × ${bouquetUnit} ₴ = ${bouquetTotal} ₴`
  : '');

const lines = [
  '💜 Бронювання лаванди',
  '',
  `Ім'я: ${d.name}`,
  `Телефон: ${d.phone}`,
  `Послуга: ${d.service_name || d.product || 'Оренда лавандового поля'}`,
  `Час: ${timingText}`,
  `Гості: ${guestsText}`,
  bouquetLine,                       // skipped below if empty
  `Вартість: ${total} ₴`,
  '',
  `Сторінка: ${d.page_url || 'https://www.dachatv.com/lavender'}`,
].filter(Boolean);

return [{ json: {
  ...d,
  guest_count: guestCount,
  extra_guests: extra,
  bouquet_quantity: bouquetQty,
  bouquet_total: bouquetTotal,
  total_price: total,
  timing_text: timingText,
  guests_text: guestsText,
  bouquet_line: bouquetLine,
  telegram_text: lines.join('\n'),
} }];
```

The website **also** sends its own Telegram message directly (via
`TELEGRAM_BOT_TOKEN`), so n8n Telegram is a redundant/secondary channel — both now
show the same correct guest count and bouquet line.
