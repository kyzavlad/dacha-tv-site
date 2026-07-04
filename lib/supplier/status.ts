// Shared, context-aware labels for the supplier-forwarding outcome stored on an
// order (`supplier_order_status` + `supplier_order_mode`). Centralised here so
// the order detail page, the orders list card, and the legacy fallback card all
// read identically — and so `sent_unconfirmed` is never mislabelled as a failure.
//
// Pure, dependency-free: safe to import from both server and client components.

export type SupplierSeverity = 'ok' | 'warn' | 'error' | 'neutral'

export interface SupplierStatusView {
  label: string
  severity: SupplierSeverity
  // Optional guidance shown to admins for statuses that need a manual action.
  hint?: string
}

// Tailwind badge classes per severity. Kept next to the view so every call site
// renders the same colour for the same meaning.
export const SUPPLIER_SEVERITY_BADGE: Record<SupplierSeverity, string> = {
  ok: 'bg-green-50 text-green-700 border-green-200',
  warn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Map a stored (status, mode) pair to a safe, clear admin-facing view.
//   sent / ok        → confirmed send (green)
//   test_sent        → accepted in TEST mode (green)
//   sent_unconfirmed → API accepted with HTTP 200 but returned NO order id. This
//                      is NOT a failure: the order is usually present in the
//                      supplier cabinet and must be verified there manually.
//   failed           → the API explicitly rejected the order (red)
//   not_sent/disabled→ kill switch on; nothing was sent (neutral)
//   skipped          → no supplier items in the order (neutral)
export function supplierStatusView(
  status: string | null | undefined,
  mode?: string | null,
): SupplierStatusView {
  const s = (status ?? '').trim()
  const isLive = mode === 'live'

  switch (s) {
    case 'sent':
    case 'ok':
      return { label: 'Надіслано постачальнику', severity: 'ok' }
    case 'test_sent':
      return { label: 'Тестово надіслано постачальнику', severity: 'ok' }
    case 'sent_unconfirmed':
      return {
        label: isLive
          ? 'Надіслано постачальнику, звірити в кабінеті'
          : 'Надіслано без підтвердження, звірити в кабінеті',
        severity: 'warn',
        hint: 'Постачальник прийняв запит (HTTP 200), але не повернув номер замовлення. Зазвичай замовлення вже є в кабінеті постачальника — перевірте його там і, за потреби, запишіть номер у нотатках.',
      }
    case 'failed':
      return {
        label: 'Помилка надсилання постачальнику',
        severity: 'error',
        hint: 'Постачальник відхилив замовлення. Перевірте технічні деталі нижче та обробіть замовлення вручну.',
      }
    case 'not_sent':
    case 'disabled':
      return { label: 'Не надіслано постачальнику', severity: 'neutral' }
    case 'skipped':
      return { label: 'Не надсилалося (немає товарів постачальника)', severity: 'neutral' }
    default:
      return { label: s || 'Невідомо', severity: 'neutral' }
  }
}
