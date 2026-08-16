import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homeDict } from '../lib/i18n/sections/home.ts'
import { shopUiDict } from '../lib/i18n/sections/shop-ui.ts'
import { pageDict } from '../lib/i18n/pages.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Final launch-closure invariants (P1-1 … P1-4).
//
// These lock MEANING, not markup: the storefront must not claim it produces the
// partner catalog, the published delivery/payment promises must match what
// checkout can actually submit, the payment choice must be usable on a 320px
// phone, and the confirmation screen must tell the truth about what happens next
// for the payment method the customer actually chose.
// ─────────────────────────────────────────────────────────────────────────────

const LOCALES = ['uk', 'ru', 'en']
const checkoutSrc = readFileSync(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')
const deliveryPageSrc = readFileSync(new URL('../app/delivery/page.tsx', import.meta.url), 'utf8')
const deliveryTeaserSrc = readFileSync(new URL('../components/home/DeliveryTeaser.tsx', import.meta.url), 'utf8')

// ── P1-1: own production vs partner catalog ──────────────────────────────────

test('homepage no longer claims every direction is Dacha TV’s own work', () => {
  const overclaims = [
    /Кожен напрям — це наша власна праця/,
    /Каждое направление — это наш собственный труд/,
    /Every part of it is our own work/i,
  ]
  for (const locale of LOCALES) {
    const story = `${homeDict(locale).storyPara1} ${homeDict(locale).storyPara2}`
    for (const re of overclaims) {
      assert.ok(!re.test(story), `${locale}: must not claim every direction is own production (${re})`)
    }
  }
})

test('homepage brand story names the partner/producer side of the catalog in every locale', () => {
  const partnerWording = {
    uk: /партнер/i,
    ru: /партнёр|партнер/i,
    en: /partner/i,
  }
  for (const locale of LOCALES) {
    assert.match(homeDict(locale).storyPara2, partnerWording[locale], `${locale}: partner catalog must be acknowledged`)
  }
})

test('the own-production claim stays scoped to what the farm actually makes', () => {
  // Honey / natural products / flowers remain truthfully "our own" — this is the
  // brand story we must NOT weaken.
  assert.match(homeDict('uk').storyTrust2Desc, /Мед/)
  assert.match(homeDict('uk').storyPara2, /мед|Мед/i)
  for (const locale of LOCALES) {
    assert.ok(homeDict(locale).storyTrust2Label.length > 0)
    // "no middlemen" may only be claimed for the farm's own produce.
    const t1 = homeDict(locale).storyTrust1Desc
    if (/посередник|посредник|middlemen/i.test(t1)) {
      assert.match(t1, /пасік|пасек|farm|apiary/i, `${locale}: "no middlemen" must be scoped to own farm produce`)
    }
  }
})

// ── P1-2: delivery/payment copy matches selectable checkout behaviour ────────

const deliverySections = (locale) => pageDict(locale).delivery.sections
const catalogSection = (locale) =>
  deliverySections(locale).find((s) => /каталог|catalog/i.test(s.heading))
const paymentSection = (locale) => deliverySections(locale).at(-1)

test('the delivery page documents the real catalog checkout in every locale', () => {
  for (const locale of LOCALES) {
    const section = catalogSection(locale)
    assert.ok(section, `${locale}: a catalog delivery section must exist`)
    assert.match(section.body, /Нов[а-яіїєґё]* Пошт[а-яіїєґё]*|Нов[а-яіїєґё]* Почт[а-яіїєґё]*|Nova Poshta/i, `${locale}: catalog ships via Nova Poshta`)
    assert.match(section.body, /накладен|наложенн|cash on delivery/i, `${locale}: COD must be documented`)
    assert.match(section.body, /передоплат|предоплат|prepay/i, `${locale}: prepayment must be documented`)
  }
})

test('catalog delivery copy never promises a carrier the checkout cannot select', () => {
  // Checkout requires a Nova Poshta warehouse — Ukrposhta and self-pickup are
  // own-farm/manual fulfilment only and must not appear as catalog options.
  for (const locale of LOCALES) {
    const body = catalogSection(locale).body
    assert.ok(!/Укрпошт|Укрпочт|Ukrposhta/i.test(body), `${locale}: Ukrposhta is not a catalog checkout option`)
    assert.ok(!/самовив|самовыв|self-pickup/i.test(body), `${locale}: self-pickup is not a catalog checkout option`)
  }
})

test('own farm fulfilment options are preserved, not deleted', () => {
  for (const locale of LOCALES) {
    const all = deliverySections(locale).map((s) => `${s.heading} ${s.body}`).join(' ')
    assert.match(all, /Укрпошт|Укрпочт|Ukrposhta/i, `${locale}: Ukrposhta must remain for own farm products`)
    assert.match(all, /самовив|самовыв|self-pickup/i, `${locale}: self-pickup must remain for bees/hives`)
  }
})

test('the payment section separates catalog orders from own-farm orders and denies online card capture', () => {
  for (const locale of LOCALES) {
    const body = paymentSection(locale).body
    assert.match(paymentSection(locale).heading, /Оплата|Payment/i, `${locale}: payment section must be last`)
    assert.match(body, /каталог|catalog/i, `${locale}: catalog payment flow must be described`)
    assert.match(body, /накладен|наложенн|cash on delivery/i)
    assert.match(body, /передоплат|предоплат|prepay/i)
    // Never imply the site itself charges a card.
    assert.match(
      body,
      /не приймає оплату карткою|не принимает оплату картой|does not take card payments/i,
      `${locale}: must state the site takes no online card payment`,
    )
  }
})

test('the #payment anchor follows the payment section instead of a hardcoded index', () => {
  assert.ok(!deliveryPageSrc.includes('SECTION_IDS'), 'the fixed index table must be gone')
  assert.match(deliveryPageSrc, /paymentAnchorIndex/)
  assert.match(deliveryPageSrc, /'payment' : undefined/)
})

test('the homepage delivery teaser matches checkout and is translated for all locales', () => {
  // Same promise as the delivery page's catalog section.
  assert.match(deliveryTeaserSrc, /Оплата при отриманні або передоплата до відправки після підтвердження менеджером/)
  assert.match(deliveryTeaserSrc, /Pay on receipt, or prepay before shipping after a manager confirms/)
  // No untranslated card is left behind (each Tr in this file carries en).
  const ukKeys = (deliveryTeaserSrc.match(/\buk: '/g) ?? []).length
  const ruKeys = (deliveryTeaserSrc.match(/\bru: '/g) ?? []).length
  const enKeys = (deliveryTeaserSrc.match(/\ben: '/g) ?? []).length
  assert.ok(ukKeys > 0 && ukKeys === ruKeys && ruKeys === enKeys,
    `every translated string in the teaser must define uk/ru/en (uk=${ukKeys} ru=${ruKeys} en=${enKeys})`)
  // The shared dictionary copy must not contradict the rendered teaser.
  for (const locale of LOCALES) {
    assert.match(homeDict(locale).deliveryCard1Desc, /передоплат|предоплат|prepay/i, `${locale}: dictionary copy must mention prepayment too`)
  }
})

test('the homepage ordering step no longer offers Ukrposhta/pickup for catalog goods', () => {
  for (const locale of LOCALES) {
    const step = homeDict(locale).orderStep3Desc
    assert.match(step, /каталог|catalog/i, `${locale}: catalog shipping must be called out separately`)
    assert.match(step, /Нов[а-яіїєґё]* Пошт[а-яіїєґё]*|Нов[а-яіїєґё]* Почт[а-яіїєґё]*|Nova Poshta/i)
  }
})

// ── P1-3: narrow-mobile payment layout ───────────────────────────────────────

test('payment options are one per row on narrow phones and two from the sm breakpoint', () => {
  assert.match(
    checkoutSrc,
    /className="grid grid-cols-1 sm:grid-cols-2 gap-3"/,
    'the payment option grid must be single-column by default',
  )
  assert.ok(
    !/className="grid grid-cols-2 gap-3"/.test(checkoutSrc),
    'no unconditional two-column payment grid may remain',
  )
})

test('payment radio semantics, names and selected state are unchanged', () => {
  assert.match(checkoutSrc, /type="radio"/)
  assert.match(checkoutSrc, /name="methodPayment"/)
  assert.match(checkoutSrc, /checked=\{methodPayment === opt\.value\}/)
  assert.match(checkoutSrc, /onChange=\{\(\) => setMethodPayment\(opt\.value\)\}/)
  assert.match(checkoutSrc, /className="sr-only"/)
  assert.match(checkoutSrc, /methodPayment === opt\.value\s*\n\s*\? 'border-honey-500 bg-honey-50'/)
})

// ── P1-4: payment-specific success next step ─────────────────────────────────

test('COD and prepayment success flows have distinct next-step content', () => {
  for (const locale of LOCALES) {
    const t = shopUiDict(locale)
    assert.notEqual(t.successCodStep3, t.successPrepayStep3, `${locale}: the final step must differ per payment method`)
    assert.match(t.successCodStep3, /при отриманні|при получении|on receipt/i, `${locale}: COD pays on receipt`)
    assert.match(t.successPrepayStep3, /реквізит|реквизит|prepayment details/i, `${locale}: prepayment gets payment details`)
    for (const key of ['successNextTitle', 'successCodStep1', 'successCodStep2', 'successPrepayStep1', 'successPrepayStep2', 'successPrepayNote']) {
      assert.ok(t[key] && t[key].trim().length > 0, `${locale}: ${key} must be translated`)
    }
  }
})

test('both flows say the order was received, and a manager confirms it', () => {
  for (const locale of LOCALES) {
    const t = shopUiDict(locale)
    for (const first of [t.successCodStep1, t.successPrepayStep1]) {
      assert.match(first, /отримали|получили|received/i, `${locale}: order receipt must be stated`)
    }
    for (const second of [t.successCodStep2, t.successPrepayStep2]) {
      assert.match(second, /менеджер|manager/i, `${locale}: manager confirmation must be stated`)
    }
  }
})

test('prepayment success never implies money was charged or the parcel already shipped', () => {
  for (const locale of LOCALES) {
    const t = shopUiDict(locale)
    const prepay = [t.successPrepayStep1, t.successPrepayStep2, t.successPrepayStep3, t.successPrepayNote].join(' ')
    assert.ok(!/оплачено|списано з картки|payment received|charged your card|已/i.test(prepay), `${locale}: no completed-payment claim`)
    assert.ok(!/вже відправ|уже отправ|already shipped|has been dispatched/i.test(prepay), `${locale}: no shipped claim`)
    assert.match(
      t.successPrepayNote,
      /ще не списан|ещё не списан|No money has been charged/i,
      `${locale}: must state no charge has been taken`,
    )
  }
})

test('the success screen renders the branch for the submitted payment method', () => {
  assert.match(checkoutSrc, /const \[successPayment, setSuccessPayment\] = useState<'cashondelivery' \| 'prepayment' \| null>\(null\)/)
  assert.match(checkoutSrc, /const submittedPayment = methodPayment/, 'the submitted method must be snapshotted before the await')
  assert.match(checkoutSrc, /successPayment === 'prepayment'\s*\n\s*\? \[t\.successPrepayStep1/)
  assert.match(checkoutSrc, /: \[t\.successCodStep1/)
})

test('no fabricated order number is shown on the success screen', () => {
  const successBlock = checkoutSrc.slice(checkoutSrc.indexOf('if (successOrderId)'), checkoutSrc.indexOf('if (!hydrated)'))
  assert.ok(!successBlock.includes('{successOrderId}'), 'the raw internal order id must not be printed as decoration')
  assert.ok(!/№|order number|Замовлення #/i.test(successBlock), 'no invented order number')
})

// ── Safety invariants that must survive these changes ────────────────────────

test('purchase analytics still fires only after a successful order, then the cart clears', () => {
  const failGuard = checkoutSrc.indexOf('if (!result.success)')
  const purchase = checkoutSrc.indexOf('trackPurchase({')
  const clear = checkoutSrc.indexOf('clearCart()')
  const payment = checkoutSrc.indexOf('setSuccessPayment(submittedPayment)')
  const success = checkoutSrc.indexOf('setSuccessOrderId(result.orderId)')
  assert.ok(failGuard > 0 && purchase > failGuard, 'purchase must come after the failure early-return')
  assert.ok(clear > purchase, 'cart clears after the purchase event')
  assert.ok(payment > clear && success > payment, 'success state is set last')
  assert.match(checkoutSrc, /isTest: result\.isTestOrder === true/, 'test orders must stay isolated from the real conversion')
})

test('checkout still submits the chosen payment method and requires a Nova Poshta warehouse', () => {
  assert.match(checkoutSrc, /fd\.set\('methodPayment', methodPayment\)/)
  assert.match(checkoutSrc, /if \(!warehouseId\)/)
  assert.match(checkoutSrc, /fd\.set\('warehouseId', warehouseId\)/)
})
