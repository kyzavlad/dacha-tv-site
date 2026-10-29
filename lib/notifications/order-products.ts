// Plain-text URLs are clickable in Telegram. Only known store routes are used;
// never trust a submitted source/landing URL as an order's product destination.
export function orderProductUrl(item: { productType: string; productSlug: string }): string | null {
  const slug = item.productSlug.trim()
  if (!slug || /[\s/\\?#\u0000-\u001f]/u.test(slug)) return null
  const route: Record<string, string> = { catalog: '/catalog/all', apiary: '/beekeeper', flower: '/flowers', honey: '/honey', custom: '/products' }
  return route[item.productType] ? `https://dachatv.com${route[item.productType]}/${encodeURIComponent(slug)}` : null
}

export function orderProductLines(items: Array<{ productType: string; productSlug: string; name: string; variant?: string; quantity: number; price: number }>): string {
  return items.map(item => [
    `• ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity} — ${item.price * item.quantity} ₴`,
    orderProductUrl(item),
  ].filter(Boolean).join('\n')).join('\n')
}
