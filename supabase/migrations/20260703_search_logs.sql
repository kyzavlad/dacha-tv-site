-- Growth Layer 1: lightweight internal site-search logging.
-- One row per logged /search query (deduped client-side per session). No PII —
-- only the query text, locale, result count, path and optional UTM source/campaign
-- read from the existing attribution cookie. Two small indexes keep the admin
-- insights aggregation cheap (bounded, time-windowed). Safe to run more than once.

create table if not exists search_logs (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  query         text        not null,
  query_norm    text        not null,           -- lowercased/trimmed, for grouping
  locale        text,
  result_count  integer,
  path          text,
  utm_source    text,
  utm_campaign  text
);

create index if not exists idx_search_logs_created_at on search_logs (created_at desc);
create index if not exists idx_search_logs_query_norm on search_logs (query_norm);

-- Service-role only: the app writes/reads via the admin client (which bypasses
-- RLS). No public/anon access to the table.
alter table search_logs enable row level security;
