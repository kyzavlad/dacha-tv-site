// ─── env-inventory.ts — read-only environment VARIABLE NAME inventory ────────
// Scans the repository source for `process.env.X` references and reports
// which variable NAMES the app needs — never values. Optionally compares
// against a provided env file, again by NAME ONLY (never reads/prints a
// value from that file), and never modifies it.
//
//   pnpm env:inventory
//   pnpm env:inventory /var/www/dacha-tv/shared/.env.production
//
// Classification is a best-effort heuristic based on the variable's name
// prefix and its immediate call-site context (default-value operators like
// `??`/`||`, or a non-throwing presence check nearby). It is NOT a substitute
// for reading the actual source when in doubt — this script says so in its
// own output rather than overclaiming precision.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const SCAN_DIRS = ['app', 'lib', 'components', 'scripts', 'actions']
const SCAN_FILES = ['next.config.ts', 'proxy.ts']
const SCAN_EXTS = new Set(['.ts', '.tsx', '.mjs', '.js'])
const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

interface EnvRef {
  name: string
  files: Set<string>
  // True if ANY call site looks like it tolerates absence (a default-value
  // operator on the same line, or a nearby non-throwing guard).
  looksOptionalAnywhere: boolean
}

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (SCAN_EXTS.has(extname(entry))) out.push(full)
  }
}

// Excluded from the scan: this tool's own file, whose doc comments mention
// `process.env.FOO`/`process.env.X` as illustrative examples, not real app
// variable names.
const SELF_PATH = join(ROOT, 'scripts', 'env-inventory.ts')

function collectFiles(): string[] {
  const files: string[] = []
  for (const d of SCAN_DIRS) {
    const full = join(ROOT, d)
    if (existsSync(full)) walk(full, files)
  }
  for (const f of SCAN_FILES) {
    const full = join(ROOT, f)
    if (existsSync(full)) files.push(full)
  }
  return files.filter((f) => f !== SELF_PATH)
}

// Matches process.env.FOO and process.env['FOO'] / process.env["FOO"].
const ENV_REF_RE = /process\.env(?:\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])/g

function scan(files: string[]): Map<string, EnvRef> {
  const refs = new Map<string, EnvRef>()
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip single-line-comment-only lines — a doc comment illustrating
      // usage (e.g. "// e.g. process.env.FOO") is not a real reference.
      // Does not catch every block-comment/inline-trailing-comment case;
      // this is a best-effort text scan, not an AST-aware one (documented
      // in this script's own header).
      if (/^\s*(\/\/|\*)/.test(line)) continue
      ENV_REF_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = ENV_REF_RE.exec(line))) {
        const name = m[1] ?? m[2]
        if (!name) continue
        const existing = refs.get(name) ?? { name, files: new Set<string>(), looksOptionalAnywhere: false }
        existing.files.add(file.replace(ROOT + '/', ''))

        // Heuristic: a default-value operator right after the reference on
        // the same line, OR a non-throwing guard within the next couple of
        // lines (`if (!process.env.X) { ... return/console/return null ... }`
        // without a `throw` in between).
        const afterMatch = line.slice(m.index + m[0].length)
        const sameLineDefault = /^\s*(\?\?|\|\|)/.test(afterMatch)
        let nearbyNonThrowingGuard = false
        {
          const window = lines.slice(i, Math.min(lines.length, i + 4)).join('\n')
          const hasThrow = /throw\s+/.test(window)
          const hasIfGuard = new RegExp(`if\\s*\\([^)]*!\\s*(process\\.env\\.${name}|${name})\\b`).test(window)
            || new RegExp(`if\\s*\\(\\s*!process\\.env\\.${name}\\s*\\)`).test(window)
          if (hasIfGuard && !hasThrow) nearbyNonThrowingGuard = true
        }

        existing.looksOptionalAnywhere = existing.looksOptionalAnywhere || sameLineDefault || nearbyNonThrowingGuard
        refs.set(name, existing)
      }
    }
  }
  return refs
}

type Category = 'build-time public' | 'runtime server' | 'optional'

function classify(ref: EnvRef): Category {
  if (ref.name.startsWith('NEXT_PUBLIC_')) return 'build-time public'
  if (ref.looksOptionalAnywhere) return 'optional'
  return 'runtime server'
}

// Reads ONLY the left-hand-side NAMES from an env file — never a value.
// KEY=value, KEY="value", KEY='value', # comments, and blank lines are all
// handled; nothing after the first `=` is ever read into memory as a string
// we might accidentally print.
function readEnvFileNames(path: string): Set<string> {
  const names = new Set<string>()
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const name = line.slice(0, eq).trim()
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name)
  }
  return names
}

function main() {
  const compareFile = process.argv[2]

  const files = collectFiles()
  const refs = scan(files)
  const sorted = [...refs.values()].sort((a, b) => a.name.localeCompare(b.name))

  console.log(`[env-inventory] scanned ${files.length} files, found ${sorted.length} distinct environment variable names.`)
  console.log('[env-inventory] classification is a best-effort heuristic — verify manually before relying on it for a production cutover.\n')

  const byCategory: Record<Category, string[]> = { 'build-time public': [], 'runtime server': [], optional: [] }
  for (const ref of sorted) byCategory[classify(ref)].push(ref.name)

  for (const cat of ['build-time public', 'runtime server', 'optional'] as Category[]) {
    console.log(`## ${cat} (${byCategory[cat].length})`)
    for (const name of byCategory[cat]) console.log(`  - ${name}`)
    console.log('')
  }

  if (!compareFile) {
    console.log('[env-inventory] no comparison file given — pass a path to compare NAMES against a real env file, e.g.:')
    console.log('  pnpm env:inventory /var/www/dacha-tv/shared/.env.production')
    return
  }

  if (!existsSync(compareFile)) {
    console.error(`[env-inventory] comparison file not found: ${compareFile}`)
    process.exitCode = 1
    return
  }

  const presentNames = readEnvFileNames(compareFile)
  const requiredNames = new Set([...byCategory['build-time public'], ...byCategory['runtime server']])
  const missingRequired = [...requiredNames].filter((n) => !presentNames.has(n)).sort()
  const missingOptional = byCategory.optional.filter((n) => !presentNames.has(n)).sort()
  const extra = [...presentNames].filter((n) => !refs.has(n)).sort()

  console.log(`## Comparison against ${compareFile.replace(ROOT + '/', '')} (names only — no values read or printed)\n`)

  if (missingRequired.length === 0) {
    console.log('All build-time-public and runtime-server variable NAMES are present.')
  } else {
    console.log(`MISSING (required) — ${missingRequired.length}:`)
    for (const n of missingRequired) console.log(`  - ${n}`)
  }
  console.log('')

  if (missingOptional.length > 0) {
    console.log(`Missing (optional, heuristically detected) — ${missingOptional.length}:`)
    for (const n of missingOptional) console.log(`  - ${n}`)
    console.log('')
  }

  if (extra.length > 0) {
    console.log(`Present in the env file but not referenced anywhere in the scanned source — ${extra.length} (informational; may be legacy or intentionally forward-provisioned):`)
    for (const n of extra) console.log(`  - ${n}`)
    console.log('')
  }

  if (missingRequired.length > 0) process.exitCode = 1
}

main()
