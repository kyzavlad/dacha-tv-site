# Metal products — trilingual content fill (Section C)

Completes UA/RU/EN content for the **11 manual metal-profile products** without a
live DB round-trip at author time. Content lives in `lib/catalog/metal-content.ts`
(pure data, unit-tested by `tests/metal-content.test.mjs`); the guarded script
`scripts/fill-metal-content.ts` writes it to production.

## The 11 products (stable slugs)

`profnastyl-hvylia-10`, `profnastyl-hvylia-20`, `profnastyl-hvylia-35`,
`profnastyl-hvylia-8-biudzhetnyi`, `metalocherepytsia-pid-rozmir`,
`standartnyi-lyst-2-0h1-18`, `metalevyi-shtaketnyk`,
`dobirni-elementy-pokrivlia-fasad`, `pokrivelni-samorizy-korotki`,
`pokrivelni-samorizy-dovhi`, `skladski-zalyshky-metalu`.

## What the fill script does

- **DRY-RUN by default.** Apply requires `--apply --current-ref=<liveref>`
  (matched against the live project ref; the service-role key is read from env
  and never printed).
- Bounded strictly to the 11 slugs above (matched by `slug`).
- **Preserves every non-empty existing value**; fills only empty/missing fields.
- UA → `catalog_products` (`name_ua`, `short_description`, `description`,
  `description_ua`, `seo_description`, `meta_title`, `meta_description`,
  `seo_keywords`, `main_image_alt`).
- RU/EN → `catalog_product_translations` (`name`, `short_description`,
  `description`, `seo_description`, `meta_title`, `meta_description`,
  `seo_keywords`), upserted on `(product_id, locale)`.
- Known characteristics are **added** into `attributes` under the Ukrainian keys
  the storefront renders (`Профіль`, `Товщина`, `Покриття`, `Колір`,
  `Загальна ширина`, `Корисна ширина`, `Довжина`, `Виробник`) — existing keys are
  never overwritten or deleted.
- `image_metadata` is built from existing `main_image_url` + `images` **only when
  absent**, attaching localized alt text without disturbing the legacy fields.
- Enforces `source='manual'`, `lead_type='metal'`, `inquiry_only=true`.

## Commands

```bash
# Dry run — writes audit/catalog-v3/metal-fill-dryrun.{json,md}, prints missing specs
npx tsx scripts/fill-metal-content.ts

# Apply — also writes audit/catalog-v3/metal-fill-rollback.json first
npx tsx scripts/fill-metal-content.ts --apply --current-ref=<liveref>
```

## Apply-time safety (hardened)

Before every production UPDATE the apply path:
- requires **exactly 11/11** metal rows present (never partially fills the set);
- **stops** on any duplicate slug in `catalog_products`;
- **re-reads the row by exact id** at write time, verifies the **slug is unchanged**
  and the row is **still manual/metal**, then **recomputes** the plan against the
  fresh row so only fields *still empty at write time* are filled (a manual edit
  made after the dry-run is never overwritten);
- re-checks the slug in the UPDATE `WHERE` clause;
- surfaces translation-read errors (fails fast if the v5 migration isn't applied).

## Rollback

`metal-fill-rollback.json` captures, per slug, the **full prior snapshot**: every
writable base field (incl. `attributes` and `image_metadata`) plus the complete
prior RU and EN translation rows. Reverse it with the executable script:

```bash
npx tsx scripts/rollback-metal-content.ts                       # dry run
npx tsx scripts/rollback-metal-content.ts --apply --current-ref=<ref>
```

It restores base fields + attributes + image_metadata, and restores each RU/EN
row to its prior state — or **deletes** a translation row the fill created where
none existed before.

## Specs NOT invented — require manual entry

Genuinely unknown characteristics are left empty (never fabricated). The script
prints and the report lists them via `METAL_UNKNOWN_SPECS`. Typical gaps:

- **Profnastil waves (10/20/35, budget 8):** `width_total`, `width_useful`,
  `manufacturer`, `length` — the seed only fixes profile/thickness/coating/colour.
- **Made-to-order items** (metalocherepytsia, shtaketnyk, dobirni elementy,
  skladski zalyshky): most structured specs are order-dependent → left empty.
- **Screws (korotki/dovhi):** dimensional specs (exact length, head size) are not
  in the seed → left empty.
- **RAL colour codes and manufacturer brand names** are never guessed.

Fill these in the admin metal editor (which now has UA/RU/EN + per-image alt).
