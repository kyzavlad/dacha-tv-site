import { test } from 'node:test'
import assert from 'node:assert/strict'
import { manualDict } from '../lib/i18n/sections/manual.ts'

test('manualDict resolves every key to a non-empty string per locale', () => {
  for (const loc of ['uk', 'ru', 'en']) {
    const t = manualDict(loc)
    for (const [k, v] of Object.entries(t)) {
      assert.equal(typeof v, 'string', `${k} should resolve to a string`)
      assert.ok(v.length > 0, `${k} should be non-empty for ${loc}`)
    }
  }
})

function assertDiffers(probes) {
  const uk = manualDict('uk'), ru = manualDict('ru'), en = manualDict('en')
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
}

test('honey landing body text differs across uk/ru/en', () => {
  // honeyEyebrow ("Каталог") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').honeyEyebrow, manualDict('en').honeyEyebrow)
  assertDiffers([
    'honeyH1', 'honeyIntro',
    'honeyPackagingTitle', 'honeyPlasticBody', 'honeyGlassTitle', 'honeyGlassBody',
    'honeyInsuranceNote', 'honeyCtaTitle', 'honeyCtaBody', 'honeyCtaButton',
  ])
})

test('apiary products (products) landing body text differs across locales', () => {
  assertDiffers(['productsEyebrow', 'productsH1', 'productsIntro', 'productsCtaTitle', 'productsCtaBody', 'productsCtaButton'])
})

test('flowers landing body text differs across locales', () => {
  assertDiffers([
    'flowersBreadcrumbHome', 'flowersBreadcrumbCurrent', 'flowersEyebrow', 'flowersH1', 'flowersIntro',
    'flowersFeatured', 'flowersInquiryTitle', 'flowersInquiryBody',
  ])
})

test('flower catalog page body text and variety descriptions differ across locales', () => {
  // catalogBreadcrumbCatalog ("Каталог") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').catalogBreadcrumbCatalog, manualDict('en').catalogBreadcrumbCatalog)
  assertDiffers([
    'catalogEyebrow', 'catalogH1', 'catalogSortsLabel', 'catalogVarietiesLabel',
    'catalogFeatured', 'catalogHit', 'catalogFrom', 'catalogCtaTitle', 'catalogCtaBody',
    'catalogPhotoCatalog', 'catalogOrderFlowers',
    'catalogDescPompon', 'catalogDescSpray', 'catalogDescExhibition', 'catalogDescMicro',
    'catalogDescCompact', 'catalogDescAnemone', 'catalogDescSpider',
  ])
})

test('beekeeper landing body text, offers and empty state differ across locales', () => {
  assertDiffers([
    'beekeeperEyebrow', 'beekeeperH1', 'beekeeperIntro', 'beekeeperOffersTitle', 'beekeeperOffersSubtitle',
    'beekeeperLeaveInquiry', 'beekeeperOrCall', 'beekeeperEmptyState', 'beekeeperImportantTitle', 'beekeeperImportantBody',
    'beekeeperFormTitle', 'beekeeperFormBody',
    'beekeeperOfferColoniesTitle', 'beekeeperOfferColoniesNote', 'beekeeperOfferSplitsTitle', 'beekeeperOfferSplitsNote',
    'beekeeperOfferHivesTitle', 'beekeeperOfferHivesNote', 'beekeeperOfferConsultTitle', 'beekeeperOfferConsultNote',
    'beekeeperTypeBeePackages', 'beekeeperTypeBeeColonies', 'beekeeperTypeEmptyHives',
    'beekeeperTypeHivesWithBees', 'beekeeperTypeApiarySupply',
  ])
})

test('services landing body text, empty state and CTAs differ across locales', () => {
  assertDiffers([
    'servicesBreadcrumbHome', 'servicesBreadcrumbCurrent', 'servicesH1', 'servicesIntro', 'servicesEmpty',
    'servicesBook', 'servicesLearnMore', 'servicesQuestionsTitle', 'servicesQuestionsBody',
  ])
})

test('lavender page body text, pricing and route/instagram sections differ across locales', () => {
  // lavenderBreadcrumbCurrent ("Лаванда") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').lavenderBreadcrumbCurrent, manualDict('en').lavenderBreadcrumbCurrent)
  // lavenderPhotoInstagram ("Фото в Instagram") and lavenderIncludedGuests ("Включено гостей")
  // are cognates identical in uk/ru; only their en values differ.
  assert.notEqual(manualDict('uk').lavenderPhotoInstagram, manualDict('en').lavenderPhotoInstagram)
  assert.notEqual(manualDict('uk').lavenderIncludedGuests, manualDict('en').lavenderIncludedGuests)
  // lavenderSeason ("Сезон"), lavenderRouteBtn ("Маршрут") and lavenderInstaTitle
  // ("Лаванда в Instagram") are cognates identical in uk/ru; only their en values differ.
  for (const k of ['lavenderSeason', 'lavenderRouteBtn', 'lavenderInstaTitle']) {
    assert.notEqual(manualDict('uk')[k], manualDict('en')[k], `uk vs en must differ: ${k}`)
  }
  assertDiffers([
    'lavenderBreadcrumbHome', 'lavenderEyebrow', 'lavenderH1', 'lavenderHeroIntro',
    'lavenderBookField',
    'lavenderRentEyebrow', 'lavenderRentTitle', 'lavenderRentIntro', 'lavenderPriceLabel',
    'lavenderMorningDay', 'lavenderPerHourDay', 'lavenderEvening', 'lavenderPerHourEvening',
    'lavenderUpToGuests', 'lavenderExtraGuest', 'lavenderExtraGuestValue',
    'lavenderWorkTime', 'lavenderSeasonValue',
    'lavenderPrepayTitle', 'lavenderPrepayBody', 'lavenderAddressTitle', 'lavenderAddressValue',
    'lavenderDaily', 'lavenderRoute', 'lavenderBookTimeTitle', 'lavenderBookTimeBody', 'lavenderRulesLabel',
    'lavenderRouteEyebrow', 'lavenderRouteTitle', 'lavenderRouteIntro', 'lavenderVideoCaption',
    'lavenderMapAddress1', 'lavenderMapAddress2', 'lavenderMapCaption',
    'lavenderInstaBody', 'lavenderInstaSubscribe',
    'lavenderCard1', 'lavenderCard2', 'lavenderCard3', 'lavenderCard4', 'lavenderCard5', 'lavenderCard6',
  ])
})

test('shared product-detail chrome (breadcrumb, booking, out-of-stock) differs across locales', () => {
  assertDiffers([
    'detailBreadcrumbHome', 'detailPrice', 'detailDuration', 'detailBookNow',
    'detailBookTitle', 'detailBookDailyBody', 'detailBookHourTitle', 'detailBookHourBody',
    'detailOrderServiceTitle', 'detailOrderServiceBody', 'detailServiceNotFound', 'detailNotAvailable',
    'detailPriceOnRequest', 'detailOrderTitle', 'detailBackToList', 'detailNotFound',
    'detailOutOfStockNote', 'detailOutOfStockShort', 'detailAlsoInterested',
  ])
})

test('honey detail page attribute labels and video captions differ across locales', () => {
  // detailSeason ("Сезон") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').detailSeason, manualDict('en').detailSeason)
  // detailAroma ("Аромат"), detailRecommended ("Рекомендовано"), detailPackaging ("Упаковка")
  // and detailPerLiter ("за 1 л") are cognates identical in uk/ru; only their en values differ.
  for (const k of ['detailAroma', 'detailRecommended', 'detailPackaging', 'detailPerLiter']) {
    assert.notEqual(manualDict('uk')[k], manualDict('en')[k], `uk vs en must differ: ${k}`)
  }
  assertDiffers([
    'detailTaste', 'detailColor', 'detailCrystallization', 'detailStorage',
    'detailVideoAbout', 'detailAlsoOnYoutube',
    'detailMostPopular', 'detailPackagingNote', 'detailShippingNote', 'detailInquireBtn',
    'detailColorLabel', 'detailBloomSeason', 'detailAvailability',
  ])
})

test('flower detail page attribute labels differ across locales', () => {
  // detailChrysanthemum ("Хризантема") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').detailChrysanthemum, manualDict('en').detailChrysanthemum)
  // detailUpTo ("до") is identical in uk/ru; only its en value differs.
  assert.notEqual(manualDict('uk').detailUpTo, manualDict('en').detailUpTo)
  assertDiffers([
    'detailFlowerOutOfStock', 'detailBlooming', 'detailHeight',
    'detailLighting', 'detailVideoAboutFlower', 'detailOtherVarieties', 'detailOrderTitle2', 'detailOrderFlowerBody',
  ])
})

test('beekeeper detail page breed/video labels differ across locales', () => {
  assertDiffers(['detailAvailableBreeds', 'detailVideoAboutProduct'])
})

test('apiary product detail page labels differ across locales', () => {
  assertDiffers([
    'detailPerUnit', 'detailComposition', 'detailUsage', 'detailPriceOnRequest2', 'detailOutOfStockNotify',
  ])
})

test('specific known-value spot checks across sections', () => {
  assert.equal(manualDict('en').honeyH1.length > 0, true)
  assert.equal(manualDict('ru').beekeeperEyebrow !== manualDict('uk').beekeeperEyebrow, true)
  assert.equal(manualDict('en').servicesEmpty !== manualDict('uk').servicesEmpty, true)
  assert.equal(manualDict('ru').lavenderRulesLabel !== manualDict('uk').lavenderRulesLabel, true)
  assert.equal(manualDict('en').detailOutOfStockNotify !== manualDict('uk').detailOutOfStockNotify, true)
})
