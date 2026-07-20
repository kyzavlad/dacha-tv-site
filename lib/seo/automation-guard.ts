// ─── SEO automation kill-switch ───────────────────────────────────────────────
// UA/RU SEO automation is intentionally paused (n8n workflows disabled) and the
// SEO passes previously drove high Supabase egress. This shared guard lets the
// SEO cron/automation entrypoints bail out BEFORE running any Supabase query,
// count, or candidate scan, so a paused system costs nothing.
//
// Enable only by setting SEO_AUTOMATION_ENABLED=true in the environment. Any
// other value (including unset) keeps SEO automation off.

export function isSeoAutomationEnabled(): boolean {
  return process.env.SEO_AUTOMATION_ENABLED === 'true'
}

export const SEO_DISABLED_REASON = 'SEO_AUTOMATION_ENABLED is not true'

// Standard small JSON payload for a disabled SEO endpoint. Cheap and honest —
// no DB access happened.
export function seoDisabledResponse(): Response {
  return Response.json({ ok: true, disabled: true, reason: SEO_DISABLED_REASON })
}
