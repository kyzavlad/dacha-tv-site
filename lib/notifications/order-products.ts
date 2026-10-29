// Plain-text URLs are clickable in Telegram. Only known store routes are used;
// never trust a submitted source/landing URL as an order's product destination.
export function orderProductUrl(item: { productType: string; productSlug: string }): string | null {
  const slug = item.productSlug.trim()
  if (!slug || slug.length > 240 || /[\s/\\?#\u0000-\u001f]/u.test(slug)) return null
  const route: Record<string, string> = { catalog: '/catalog/all', apiary: '/beekeeper', flower: '/flowers', honey: '/honey', custom: '/products' }
  return route[item.productType] ? `https://dachatv.com${route[item.productType]}/${encodeURIComponent(slug)}` : null
}

export function orderProductLines(items: Array<{ productType: string; productSlug: string; name: string; variant?: string; quantity: number; price: number }>): string {
  return items.map(item => [
    `• ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity} — ${item.price * item.quantity} ₴`,
    orderProductUrl(item),
  ].filter(Boolean).join('\n')).join('\n')
}

// Telegram accepts at most 4096 UTF-16 units. Keep one notification, complete
// product links and the total; full item/error details remain in webhook/DB.
export function compactTelegramOrderMessage(message: string): string {
  if (message.length <= 4096) return message
  const lines = message.split('\n')
  const starts = lines.flatMap((line, i) => line.startsWith('• ') ? [i] : [])
  const compact = (value: string, budget: number) => value.length <= budget ? value : value.slice(0, budget - 1) + '…'
  if (!starts.length) return compact(message, 4096)
  const last = starts.at(-1)!
  const end = last + (lines[last + 1]?.startsWith('https://dachatv.com/') ? 2 : 1)
  const head = compact(lines.slice(0, starts[0]).join('\n'), 1100)
  const tail = compact(lines.slice(end).join('\n'), 900)
  const groups = starts.map(i => [compact(lines[i], 300), lines[i + 1]?.startsWith('https://dachatv.com/') ? lines[i + 1] : null].filter(Boolean).join('\n'))
  const selected: string[] = []
  const budget = 4096 - head.length - tail.length - 150
  let used = 0
  for (const group of groups) {
    if (used + group.length + 1 > budget) break
    selected.push(group); used += group.length + 1
  }
  const omitted = groups.length - selected.length
  return [head, ...selected, omitted ? `… Ще ${omitted} товарних позицій. Повний склад збережено в замовленні.` : null, tail].filter(Boolean).join('\n')
}
