# Дача TV — Build Rules

> Concise reference for anyone building or contributing to this project.
> These rules take precedence over convention when there is a conflict.
> Do not add features, pages, or abstractions not described in the planning documents.

---

## Business Goals

1. **Primary goal:** Convert YouTube and social traffic into phone calls and inquiry form submissions.
2. **Secondary goal:** Build brand credibility so visitors trust the product before they buy.
3. **Not a goal at launch:** Online checkout, user accounts, payment processing, or a product marketplace.
4. Every feature, page, and design decision should be traceable to one of these goals.

---

## Conversion Rules

- Every product page must have a visible, tappable CTA above the scroll line on mobile.
- The phone number must be present in the site header on every page. It must be a `tel:` link.
- Honey and apiary products use an order/inquiry form. No cart. No checkout.
- Bee packages, colonies, and hives use an inquiry form with no price shown. Always.
- No prices are shown anywhere on the site at launch — for any product.
- Form submissions must be stored to Supabase before a success response is returned. A lost lead is worse than a slow response.
- Every form submission triggers a Telegram notification AND a Resend email. Both. Not either/or.
- The inquiry dashboard at `/admin` must be usable on a phone. Large tap targets, tap-to-call.

---

## Design Rules

### What this brand looks like

- Warm, natural, clean. Premium without being luxury. Real without being rustic.
- Colour anchors: warm amber (product), deep forest green (nature/trust), warm off-white (background).
- Headings: modern serif or semi-serif. Body: clean readable sans-serif.
- Generous whitespace. Product imagery dominates. Text supports, not substitutes.
- Full-width hero sections. Clean 2-col (mobile) / 3-col (desktop) product grids.
- High-contrast CTAs. Never buried.

### What this brand does NOT look like

- No cartoon bees.
- No yellow-and-black striped anything.
- No honey drip SVGs as primary decoration.
- No fake luxury (excessive gold gradients, ornate borders).
- No rustic/village aesthetic (distressed textures, handwritten fonts, worn-wood templates).
- No stock photography. Ever.
- No fake urgency badges ("Only 3 left!", "Limited offer!", "50% OFF!!!").
- No dark/gothic styling.
- Nothing that looks like a free Wix template.

---

## Brand Tone

- Ukrainian language throughout. No surzhyk. No formal bureaucratic language.
- Warm, direct, peer-level. Not corporate. Not sales-pitchy.
- Say WHY, not just WHAT. "Кристалізується повільно — тому ідеально для подарунка" is better than "якісний мед".
- Seasonal honesty: if a product isn't available yet, say so. This builds trust.
- Tone on `/beekeeper` is peer-to-peer — expert to expert. Not a pitch.
- Never fabricate reviews, credentials, or availability.

---

## Location Language Rules

| Context | Use |
|---|---|
| Hero tagline | "на Харківщині" or "поблизу Харкова" |
| Product descriptions | "Харківська область" where natural |
| Home page delivery block | "на Харківщині, поруч із Харковом" |
| About page | "Коротич, Харківська область" — full detail is appropriate here |
| Contact page | Full: "Коротич, Пісочинська ОТГ, Харківська область, Україна" |
| Footer | Full address |
| Structured data / schema | Full address |

Do not repeat "Пісочинська ОТГ" in marketing copy, product pages, or the hero. It is an administrative term that adds friction without adding trust in those contexts.

---

## Content and CMS Rules

- All editable content (products, FAQ, reviews, site config, delivery text) lives in Sanity.
- No product data in TypeScript files. Static data creates a developer bottleneck for routine changes.
- The owner must be able to update any product, toggle availability, add a review, or change the phone number from a phone browser without developer help.
- All social media URLs (YouTube, Facebook, Instagram, TikTok) are in Sanity `siteConfig`. They are never hardcoded in components.
- The YouTube link on the site always points to the **main Дача TV channel**. The secondary channel is not linked anywhere.
- ISR revalidation (60s) is sufficient for content freshness at launch. Do not over-engineer caching.

---

## Mobile Rules

- Design mobile-first. Desktop is an enhancement.
- Minimum tap target: 44×44px.
- Phone numbers are always `tel:` links — never plain text.
- Forms must be comfortable to fill on a phone (large inputs, no tiny dropdowns where avoidable).
- The inquiry dashboard `/admin` is primarily a mobile tool — design it that way.
- No horizontal scrolling on any screen.
- Hero images must remain legible on small screens — use overlay or text shadow if needed.
- No hover-only interactions for primary functionality.

---

## Content Hierarchy Rules

- One H1 per page.
- Page titles follow the pattern: `[Page subject] | Дача TV`.
- Meta descriptions are 150–160 characters, written in Ukrainian, include a natural keyword.
- OG image required on home page and all product pages.
- Every image must have Ukrainian alt text that describes the image.
- FAQs on product pages are inline (2–3 questions max). Full FAQ lives at `/faq`.

---

## Trust Document Rules

- Do not publish full apiary passports, veterinary documents, or internal certifications publicly.
- Trust is built through real photos, real reviews, real content, and the YouTube channel — not document scans.
- If a document visual is ever referenced: show a partial or cropped preview with sensitive data redacted.
- Never upload unredacted internal documents to public-facing storage.
- Written credibility statements ("наша пасіка проходить регулярний ветеринарний контроль") are preferable to document uploads.

---

## Product Scope Rules

V1 is scoped to:
- Honey (6 varieties, 2 packaging options)
- Pollen, propolis, nuts in honey
- Bee packages (3 breeds), bee colonies, hives

Do not add:
- Lavender, herbs, or other garden/lifestyle products
- Gift sets as a separate catalog section (Phase 2)
- Any wholesale/B2B catalog pages
- Any expanded eco/lifestyle brand direction

Leave room architecturally (Sanity schemas allow new product types), but do not build or populate categories that are not in scope.

---

## Performance Rules

- Lighthouse mobile score target: 90+.
- LCP target: < 2.5s on mobile.
- Hero image must use `priority` prop on Next.js `<Image>`.
- No unoptimised images (`unoptimized` prop is forbidden).
- YouTube embeds use facade loading (click-to-load) — never autoplay, never eager-load the iframe.
- Maximum 1 YouTube embed per page.
- No `console.log` in production builds.

---

## Security Rules

- `SUPABASE_SERVICE_ROLE_KEY` is server-side only. It must never appear in client-side code or be exposed via a public API route.
- `ADMIN_PASSWORD` for the `/admin` route is set via environment variable. It is never hardcoded.
- All form Server Actions validate with Zod before any database write.
- All forms include a honeypot field for bot filtering.
- Rate limiting: max 3 form submissions per IP per hour.
- Admin session uses an HTTP-only cookie. No JWT in localStorage.

---

## Things to Never Build in V1

- Shopping cart
- Checkout / payment processing
- User accounts or authentication beyond the single admin password
- Blog or CMS-driven content hub (link to YouTube instead)
- Nova Poshta API integration
- Inventory level tracking (boolean inStock is sufficient)
- Multi-language routing
- Any page or feature not described in the planning documents

If a request falls outside this list, it requires an explicit planning update and review before implementation begins.

---

## Future-Proofing Rules

These rules ensure v1 does not block Phase 2 work:

- Sanity schemas must include an `inStock` boolean on all product types — used now, extended later.
- Supabase `inquiries` table includes a `status` column from day one — the admin dashboard uses it.
- Social URLs in Sanity `siteConfig` allow platform changes without code deploys.
- Product slugs in Sanity are the canonical identifiers — URL structure `/honey/[slug]` is permanent.
- Do not hardcode any content that the owner will need to change — it belongs in Sanity.
- Do not couple Telegram notification logic tightly — it should be easy to add additional channels later.
- Keep the admin dashboard decoupled from the public site logic — it will grow independently.
