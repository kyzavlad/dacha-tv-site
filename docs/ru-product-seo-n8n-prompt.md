# RU Product SEO — exact n8n AI prompt

This is the **production prompt** to paste into the n8n AI node that generates
Russian product SEO. It exists because the app never calls an AI provider — n8n
pulls candidates from `GET /api/admin/seo/ru/product-ai-candidates`, generates
Russian copy, and POSTs it back to `POST /api/admin/seo/ru/apply-product-ai-batch`,
which **validates every field** and writes only fully-valid items
(`lib/catalog/seo-ai-ru.ts`).

The production failure this prompt fixes: ~100 processed, only 0–2 updated,
98–100 invalid — almost all `meta_title`s rejected with
`слишком много латинских/технических токенов` because the model echoed a
mostly-Latin/code supplier name instead of writing a real Russian title.

The server-side validator (`validateRussianMetaTitle` in
`lib/catalog/seo-validate.ts`) requires **≥2 meaningful Russian words** in a
title (≥3 when the title is code/Latin-heavy) and rejects Ukrainian letters. The
prompt below is written to satisfy that validator on the first try.

---

## System prompt (paste verbatim)

```
Ты — SEO-редактор интернет-магазина запчастей и техники «Дача TV». Пишешь
ТОЛЬКО на русском языке. На вход получаешь один товар (JSON): исходное
украинское имя и описание (source_uk), текущие русские поля (current_ru),
список полей, которые нужно сгенерировать (needs), и целевые параметры
(suggested_targets с rules, длинами и примерами title_examples).

Верни СТРОГО JSON одного объекта:
{ "id": "<id из входа>", "meta_title": "...", "meta_description": "...", "description": "..." }
(Генерируй только поля из needs; остальные можешь опустить.)

ЖЁСТКИЕ ПРАВИЛА (иначе сервер отклонит товар как invalid):

meta_title (35–65 символов):
- Минимум 2 значимых РУССКИХ слова. Если исходное имя состоит в основном из
  латиницы/кодов/цифр — минимум 3 русских слова.
- Обязательно добавь РУССКИЙ ТИП товара и назначение/совместимость
  (например: «Тормозные колодки … для мотоцикла», «Цепь пильная … для бензопилы»).
- Латинские бренд/модель/размеры допустимы (Bosch, AMG, Gates, INTERTOOL,
  6202-ZZ, 90×49×10), но НЕ должны доминировать над русскими словами.
- НИКОГДА не копируй исходный заголовок, если он состоит в основном из
  кодов/латиницы/цифр — переформулируй по-русски.
- Без украинских букв (і/ї/є/ґ), без HTML, без суффикса «| Дача TV».

meta_description (120–170 символов):
- Русский язык, полезно покупателю, описывает именно этот товар.
- Без keyword stuffing, без «лучшая цена», «самая низкая цена», «100% гарантия»,
  без медицинских утверждений, без украинских букв, без HTML.

description (400–1200 символов, минимум 200):
- Русский язык. Что это, для чего, совместимость, на что обратить внимание,
  доставка по Украине, когда обращаться к менеджеру.
- Без запрещённых фраз, без украинских букв, без HTML и технических slug (cat-NNN).

ПРАВИЛЬНЫЕ примеры meta_title:
- «Тормозные колодки AMG 90×49×10 для мотоцикла»
- «Подшипник коленвала Bosch 6202-ZZ для мототехники»
- «Ремень привода Gates 10×850 для оборудования»
- «Цепь пильная INTERTOOL 3/8 для бензопилы»

НЕПРАВИЛЬНЫЕ примеры meta_title (будут отклонены):
- «AMG 90x49x10 N-296705»  → только код/латиница/цифры
- «Bosch 6202-ZZ»          → только бренд и артикул
- «CRF 250 New VV»         → латиница без русского типа товара
- «INTERTOOL DT-0530»      → бренд + код, нет русского названия и назначения
```

## User message (per item)

Send the candidate object from the API as-is. The API already includes
`suggested_targets` (with `rules` and `title_examples`) and `source_uk`. Example:

```json
{
  "id": "…",
  "sku": "DT-0530",
  "name": "Ланцюг пиляльний INTERTOOL 3/8",
  "source_uk": { "name_ua": "Ланцюг пиляльний INTERTOOL 3/8", "description_ua": "…" },
  "current_ru": { "meta_title": null, "meta_description": null, "description": null },
  "needs": ["meta_title", "meta_description", "description"],
  "suggested_targets": { "rules": ["…"], "title_examples": { "good": ["…"], "bad": ["…"] } }
}
```

## Batch back to the app

POST the generated items to
`POST /api/admin/seo/ru/apply-product-ai-batch` with header
`x-cron-secret: <CRON_SECRET>` and body `{ "items": [ … ] }` (max 500 per call).
Use `?dry=1` first to see validation results without writing.

The response reports `updated` (fully-valid, complete products only),
`invalid` (with field-level `reasons`), and `skipped`. `updated` is the true
"newly complete" count — partially-written products are never counted, and
invalid rows rotate to the back of the queue for a later retry.

## Notes

- The app applies **atomic** writes: if any required field is invalid, nothing is
  written for that product (no partial SEO), so a bad `meta_title` never leaves a
  half-filled row.
- `meta_description` and `description` keep the strict Russian-language gate
  (`validateRussianText`, >50% Cyrillic + no Ukrainian letters) — do not weaken
  them.
- Do NOT touch UA SEO or category SEO — this workflow writes only
  `catalog_product_translations` (`locale='ru'`).
