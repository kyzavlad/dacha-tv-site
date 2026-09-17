# Index hygiene — 2026-09-17

Production DB classification after fresh supplier sync:

- 66,118 published supplier products are out of stock; all 66,118 still exist in the live supplier table and were synced within 24h. Policy: temporary OOS, keep PDP live/indexable, truthful Product/Offer OutOfStock, block purchase, omit from product sitemap until stock returns.
- Supplier categories: 272 active; 59 temporarily OOS; 27 truly empty supplier leaves; 1 empty direct-product parent with children; 8 manual/special Dacha categories.
- True empty supplier leaves: no sitemap; noindex/follow; do not manufacture thin copy. Unpublish only if supplier taxonomy confirms deletion rather than temporary absence.
- Temporarily OOS categories: preserve URL/index state; do not unpublish solely due stock state.
- Parent category: preserve hierarchy/navigation; standalone indexing only if it has useful factual landing content.
- Manual/special categories: preserve according to manual ownership; never classify from supplier emptiness.

The product sitemap implementation now excludes temporary supplier OOS products and automatically re-includes them when current supplier stock returns. This is reversible and does not delete or archive catalog rows.