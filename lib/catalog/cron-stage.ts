// Generic isolation wrapper for a bounded cron endpoint made of several
// independent stages (e.g. sync-categories: supplier sync → catalog sync →
// repair → publish → backfill). A stage that throws must never crash the
// route or stop the remaining stages — it is caught here and reported as a
// failed stage with a truthful, uniform contract instead.
export interface StageReport {
  ok: boolean
  processed?: number
  updated?: number
  remaining?: number
  errors: number
  message: string
  durationMs: number
}

export async function runCronStage<T extends { ok: boolean; message?: unknown }>(
  fn: () => Promise<T>,
): Promise<StageReport> {
  const startedAt = Date.now()
  try {
    const r = (await fn()) as T & Record<string, unknown>
    return {
      ok: r.ok,
      processed: (r.synced as number | undefined) ?? (r.inserted as number | undefined),
      updated: (r.updated as number | undefined) ?? (r.catalogFixed as number | undefined) ?? (r.numericFixed as number | undefined),
      remaining: r.remaining as number | undefined,
      errors: (r.errors as number | undefined) ?? (r.ok ? 0 : 1),
      message: String(r.message ?? ''),
      durationMs: Date.now() - startedAt,
    }
  } catch (e) {
    return {
      ok: false,
      errors: 1,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startedAt,
    }
  }
}
