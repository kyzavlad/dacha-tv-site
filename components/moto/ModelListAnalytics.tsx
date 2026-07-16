'use client'

import { useEffect, useRef } from 'react'
import { trackViewItemList, trackSelectItem, type AnalyticsItem } from '@/lib/analytics/gtag'

// Thin client wrapper around the (server-rendered) model product grid. It fires
// GA4 `view_item_list` once on mount and `select_item` on click via event
// delegation — reading the clicked card's data-item-id. The grid + cards stay
// server components; only this wrapper is client. Uses the existing gtag helpers,
// so no gtag config is duplicated and no existing event is changed.
interface Props {
  listId: string
  listName: string
  items: AnalyticsItem[]
  children: React.ReactNode
}

export function ModelListAnalytics({ listId, listName, items, children }: Props) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackViewItemList(listId, listName, items)
  }, [listId, listName, items])

  const byId = new Map(items.map((it) => [it.item_id, it]))
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    // select_item must fire ONLY on an actual product-navigation link. Require a
    // real <a> that is INSIDE the card (data-item-id). This excludes whitespace,
    // buttons and the add-to-cart control (a <button>, which has no ancestor <a>).
    const link = target.closest('a')
    if (!link) return
    const card = link.closest('[data-item-id]')
    const id = card?.getAttribute('data-item-id')
    if (!id) return
    const item = byId.get(id)
    if (item) trackSelectItem(listId, listName, item)
  }

  return <div onClick={handleClick}>{children}</div>
}
