// Shared CSV + Google Sheets parsing utilities used by the pipeline and import pages.

export function autoSlug(text: string): string {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',
    и:'y',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
    р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',
  }
  return text.toLowerCase().split('').map((c) => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now()}`
}

export function parseSheetUrl(raw: string): {
  spreadsheetId: string | null
  gid: string
  exportUrl: string
  pubUrl: string
  gvizUrl: string
} {
  const t = raw.trim()

  // Detect already-published / direct CSV URLs — use as-is, do NOT re-normalize.
  // Patterns: /d/e/2PACX-...  |  ?output=csv  |  /export?format=csv
  const isDirectCsv =
    /\/spreadsheets\/d\/e\/2PACX-/.test(t) ||
    /[?&]output=csv/.test(t) ||
    /\/export[?].*format=csv/.test(t)

  if (isDirectCsv) {
    const gidM = t.match(/[#&?]gid=(\d+)/)
    const gid  = gidM ? gidM[1] : '0'
    return { spreadsheetId: null, gid, exportUrl: t, pubUrl: t, gvizUrl: t }
  }

  // Standard edit / share URL — extract real spreadsheetId (not the "e" before 2PACX)
  const idMatch = t.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]+)/)
  const spreadsheetId = idMatch ? idMatch[1] : null
  const gidM = t.match(/[#&?]gid=(\d+)/)
  const gid  = gidM ? gidM[1] : '0'

  if (!spreadsheetId) {
    return { spreadsheetId: null, gid, exportUrl: t, pubUrl: t, gvizUrl: t }
  }

  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
  return {
    spreadsheetId,
    gid,
    exportUrl: `${base}/export?format=csv&gid=${gid}`,
    pubUrl:    `${base}/pub?gid=${gid}&single=true&output=csv`,
    gvizUrl:   `${base}/gviz/tq?tqx=out:csv&gid=${gid}`,
  }
}

export function normalizeSheetUrl(raw: string): string {
  return parseSheetUrl(raw).exportUrl
}

export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows: string[][] = []
  const lines = clean.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cols: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    cols.push(cur.trim())
    rows.push(cols)
  }
  return rows
}

// Maps normalized header string → internal field name.
// "id" is NOT mapped to "sku" when both ID and SKU columns are present.
export const HEADER_MAP: Record<string, string> = {
  sku: 'sku', article: 'sku', артикул: 'sku', supplier_sku: 'sku', код: 'sku',
  name: 'name', title: 'name', назва: 'name', наименование: 'name', name_ua: 'name', 'назва (укр)': 'name',
  price: 'price', ціна: 'price', цена: 'price', price_uah: 'price',
  stock: 'stock', quantity: 'stock', qty: 'stock', залишок: 'stock', кількість: 'stock', stock_quantity: 'stock', in_stock: 'stock',
  images: 'images', image: 'images', photo: 'images', фото: 'images', images_url: 'images', image_url: 'images',
  description: 'description', опис: 'description', description_ua: 'description',
  meta_title: 'meta_title', 'meta title': 'meta_title', 'seo title': 'meta_title',
  meta_description: 'meta_description', 'meta description': 'meta_description', 'seo description': 'meta_description',
  meta_keywords: 'meta_keywords', keywords: 'meta_keywords',
  category: 'category', categories: 'category', категорія: 'category', категории: 'category', категория: 'category',
}

// Normalize headers: if there is no SKU column but there is an ID column, treat ID as SKU.
export function normalizeHeaders(headers: string[]): string[] {
  const hasSku = headers.some((h) => HEADER_MAP[h.toLowerCase().trim()] === 'sku')
  const hasId = headers.some((h) => h.toLowerCase().trim() === 'id')
  if (!hasSku && hasId) {
    return headers.map((h) => (h.toLowerCase().trim() === 'id' ? 'SKU' : h))
  }
  return headers
}

export function getCol(row: string[], headers: string[], field: string): string {
  const idx = headers.findIndex((h) => HEADER_MAP[h.toLowerCase().trim()] === field)
  return idx >= 0 ? (row[idx] ?? '').trim() : ''
}

export type FetchOk = {
  ok: true
  text: string
  csvUrl: string
  spreadsheetId: string | null
  gid: string
  sheetWarning?: string
  contentType?: string
  finalUrl?: string
}
export type FetchErr = {
  ok: false
  error: string
  csvUrl: string
  spreadsheetId: string | null
  gid: string
  // HTTP diagnostics — always populated when a real HTTP call was made
  httpStatus?: number
  contentType?: string
  bodyPreview?: string
  finalUrl?: string
}

// Google Sheets CDN requires a browser-like User-Agent; without it the server
// returns an HTML redirect/sign-in page instead of CSV even for published URLs.
const FETCH_HEADERS = {
  'Accept': 'text/csv,text/plain,*/*',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

export async function fetchCsvText(rawUrl: string): Promise<FetchOk | FetchErr> {
  const t = rawUrl.trim()
  const { spreadsheetId, gid, exportUrl, pubUrl, gvizUrl } = parseSheetUrl(t)

  // Detect direct published CSV URLs (/d/e/2PACX-... or ?output=csv or /export?format=csv)
  const isDirectPub = /\/spreadsheets\/d\/e\/2PACX-/.test(t)
  const isDirectCsv = isDirectPub || /[?&]output=csv/.test(t) || /\/export[?].*format=csv/.test(t)

  const sheetWarning = isDirectPub && !/[#&?]gid=\d+/.test(t)
    ? 'Таблиця опублікована без вказання конкретного листа (немає gid=…). Використовується перший видимий лист. Щоб вказати лист — додайте &gid=0 або відповідний gid.'
    : undefined

  type AttemptResult = {
    ok: boolean
    status: number
    text: string
    contentType: string
    finalUrl: string
  }

  async function attempt(url: string): Promise<AttemptResult> {
    try {
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow', headers: FETCH_HEADERS })
      const text = await res.text()
      return {
        ok: res.ok,
        status: res.status,
        text,
        contentType: res.headers.get('content-type') ?? '',
        finalUrl: res.url || url,
      }
    } catch (e) {
      return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e), contentType: '', finalUrl: url }
    }
  }

  function isHtml(text: string) { return text.trimStart().startsWith('<') }

  function buildHtmlError(a: AttemptResult, url: string, sid: string | null, g: string): FetchErr {
    const preview = a.text.slice(0, 120).replace(/\s+/g, ' ').trim()
    const redirectNote = a.finalUrl && a.finalUrl !== url ? `\nURL після редіректу: ${a.finalUrl}` : ''
    return {
      ok: false,
      error: [
        `HTTP ${a.status || 200}: відповідь HTML замість CSV.`,
        `URL: ${url}${redirectNote}`,
        `Content-Type: ${a.contentType || '(не вказано)'}`,
        `Відповідь (перші 120 символів): ${preview}`,
        '',
        'Рішення: Google Sheets → Файл → Опублікувати у вебі → формат "Значення через кому (.csv)" → Опублікувати.',
        'Переконайтесь що таблиця опублікована, а не просто з доступом "Всі з посиланням".',
      ].join('\n'),
      csvUrl: url,
      spreadsheetId: sid,
      gid: g,
      httpStatus: a.status || 200,
      contentType: a.contentType,
      bodyPreview: preview,
      finalUrl: a.finalUrl,
    }
  }

  function goodResult(a: AttemptResult, url: string, sid: string | null, g: string): FetchOk | FetchErr {
    if (isHtml(a.text)) return buildHtmlError(a, url, sid, g)
    return { ok: true, text: a.text, csvUrl: url, spreadsheetId: sid, gid: g, sheetWarning, contentType: a.contentType, finalUrl: a.finalUrl }
  }

  // For direct published CSV URLs: single attempt, no fallbacks (all 3 would be identical).
  if (isDirectCsv) {
    const r = await attempt(t)
    if (r.ok) return goodResult(r, t, null, gid)
    // Non-2xx status — build diagnostic error
    const preview = r.text.slice(0, 120).replace(/\s+/g, ' ').trim()
    return {
      ok: false,
      error: [
        `HTTP ${r.status}: ${preview}`,
        `URL: ${t}${r.finalUrl !== t ? `\nURL після редіректу: ${r.finalUrl}` : ''}`,
        `Content-Type: ${r.contentType || '(не вказано)'}`,
        '',
        'Перевірте: Файл → Опублікувати у вебі → формат CSV, або переконайтесь що посилання доступне публічно.',
      ].join('\n'),
      csvUrl: t,
      spreadsheetId: null,
      gid,
      httpStatus: r.status,
      contentType: r.contentType,
      bodyPreview: preview,
      finalUrl: r.finalUrl,
    }
  }

  // Standard edit/share URL — try /export → /pub → /gviz in order
  const r1 = await attempt(exportUrl)
  if (r1.ok) return goodResult(r1, exportUrl, spreadsheetId, gid)

  const r2 = await attempt(pubUrl)
  if (r2.ok) return goodResult(r2, pubUrl, spreadsheetId, gid)

  const r3 = await attempt(gvizUrl)
  if (r3.ok) return goodResult(r3, gvizUrl, spreadsheetId, gid)

  // All three failed — full diagnostic
  const preview = (r1.text || r2.text || r3.text).slice(0, 120).replace(/\s+/g, ' ').trim()
  const debugLines = [
    `spreadsheetId: ${spreadsheetId ?? 'не знайдено'} · gid: ${gid}`,
    `export → HTTP ${r1.status} · CT: ${r1.contentType || '—'} · ${r1.text.slice(0, 60).replace(/\s+/g, ' ')}`,
    `pub    → HTTP ${r2.status} · CT: ${r2.contentType || '—'} · ${r2.text.slice(0, 60).replace(/\s+/g, ' ')}`,
    `gviz   → HTTP ${r3.status} · CT: ${r3.contentType || '—'} · ${r3.text.slice(0, 60).replace(/\s+/g, ' ')}`,
    '',
    'Таблиця недоступна публічно. Відкрийте: Файл → Публікувати у вебі → CSV, або дайте доступ "Всі з посиланням".',
  ]
  return {
    ok: false,
    error: debugLines.join('\n'),
    csvUrl: exportUrl,
    spreadsheetId,
    gid,
    httpStatus: r1.status,
    contentType: r1.contentType,
    bodyPreview: preview,
    finalUrl: r1.finalUrl,
  }
}
