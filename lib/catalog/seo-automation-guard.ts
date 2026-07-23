// ─── SEO automation kill switch ────────────────────────────────────────────
// Every mass-generation/candidate/apply route under app/api/admin/seo/** must
// call this BEFORE doing any real work — before creating a Supabase client,
// before any candidate/count query, before any batch-report scan, before any
// write. Disabled by default (requires the literal string "true", nothing
// else — unset, "1", "TRUE", etc. all stay disabled) so a route can never be
// accidentally left live by a misconfigured env var.
//
// The disabled response is deliberately `ok: true` (not an error) so an n8n
// workflow polling these endpoints sees a clean "nothing to do" result rather
// than a failure it might retry or alert on.
export function isSeoAutomationEnabled(): boolean {
  return process.env.SEO_AUTOMATION_ENABLED === 'true'
}

export interface SeoAutomationDisabledBody {
  ok: true
  disabled: true
  reason: string
}

export function seoAutomationDisabledBody(): SeoAutomationDisabledBody {
  return { ok: true, disabled: true, reason: 'SEO_AUTOMATION_ENABLED is not true' }
}

export function seoAutomationDisabledResponse(): Response {
  return Response.json(seoAutomationDisabledBody())
}
