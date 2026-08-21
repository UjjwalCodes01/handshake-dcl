#!/usr/bin/env node
/**
 * Pre-deploy check. Run before Creator Hub -> Publish.
 *
 * Decentraland splits its limits in two, and the distinction matters:
 *
 *   HARD (deployment is BLOCKED)   file count, total size, per-file size
 *   SOFT (warning + worse perf)    triangles, entities, bodies, materials,
 *                                  textures, height
 *
 * This reports both, but only fails the run on a hard limit — the soft ones are
 * judgement calls that need a frame-rate measurement to settle, not a script.
 *
 *   node tools/preflight.mjs
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const PARCELS = JSON.parse(readFileSync(join(ROOT, 'scene.json'), 'utf8')).scene.parcels.length

// Per-parcel limits, from docs/scene-limitations.
const LIMITS = {
  files: 200 * PARCELS,
  // Genesis City is 15 MB/parcel. Worlds are governed by NAME ownership and are
  // far more generous, so this is the conservative bound to design against.
  totalBytes: 15 * 1024 * 1024 * PARCELS,
  perFileBytes: 50 * 1024 * 1024,
  entities: 200 * PARCELS,
  materials: Math.log2(PARCELS + 1) * 20,
  textures: Math.log2(PARCELS + 1) * 10,
  heightM: Math.log2(PARCELS + 1) * 20
}

/** Patterns from .dclignore, in the simple glob dialect the CLI uses. */
function loadIgnore() {
  const path = join(ROOT, '.dclignore')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

function ignored(relPath, patterns) {
  const parts = relPath.split(sep)
  const base = parts[parts.length - 1]
  for (const p of patterns) {
    if (p === relPath || p === base) return true
    if (parts.includes(p)) return true // a directory name anywhere in the path
    if (p.startsWith('*.') && base.endsWith(p.slice(1))) return true
    if (p === '.*' && base.startsWith('.')) return true
    if (p.endsWith('/*') && relPath.startsWith(p.slice(0, -2) + sep)) return true
  }
  return false
}

function walk(dir, patterns, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = relative(ROOT, abs)
    if (name === 'node_modules' || name === '.git') continue
    const st = statSync(abs)
    if (st.isDirectory()) {
      if (ignored(rel, patterns)) continue
      walk(abs, patterns, out)
    } else if (!ignored(rel, patterns)) {
      out.push({ rel, bytes: st.size })
    }
  }
  return out
}

const kb = (b) => `${(b / 1024).toFixed(0)} KB`
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`

const patterns = loadIgnore()
const files = walk(ROOT, patterns).sort((a, b) => b.bytes - a.bytes)
const total = files.reduce((s, f) => s + f.bytes, 0)

let failed = false
const line = (ok, label, detail) => {
  if (!ok) failed = true
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ${detail}`)
}

console.log(`\nPreflight — ${PARCELS} parcel${PARCELS > 1 ? 's' : ''}\n`)
console.log('HARD limits (these block deployment)')
line(files.length <= LIMITS.files, 'file count', `${files.length} / ${LIMITS.files}`)
line(total <= LIMITS.totalBytes, 'total upload size', `${mb(total)} / ${mb(LIMITS.totalBytes)}`)
const biggest = files[0]
line(
  !biggest || biggest.bytes <= LIMITS.perFileBytes,
  'largest single file',
  biggest ? `${mb(biggest.bytes)} (${biggest.rel})` : 'n/a'
)

console.log('\nRequired files')
const scene = JSON.parse(readFileSync(join(ROOT, 'scene.json'), 'utf8'))
line(existsSync(join(ROOT, scene.main)), 'scene main bundle', scene.main)
const thumb = scene.display?.navmapThumbnail
if (thumb) line(existsSync(join(ROOT, thumb)), 'navmap thumbnail', thumb)
line(!!scene.worldConfiguration?.name, 'world name set', scene.worldConfiguration?.name ?? 'MISSING')
line(scene.authoritativeMultiplayer === true, 'multiplayer server on', String(scene.authoritativeMultiplayer))

// The dev bundle carries a ~5 MB inline sourcemap. It deploys perfectly happily
// and costs every visitor a multi-megabyte download before anything renders,
// which on a phone is the difference between "loading" and "broken".
const bundle = files.find((f) => f.rel === scene.main.split('/').join(sep))
if (bundle) {
  const looksDev = bundle.bytes > 1024 * 1024
  console.log('\nBundle')
  line(
    !looksDev,
    'built for production',
    looksDev
      ? `${mb(bundle.bytes)} — looks like a DEV build. Run: npm run build:prod`
      : `${kb(bundle.bytes)} (sourcemap stripped)`
  )
}

console.log('\nSOFT limits (warnings only — need a device to settle)')
console.log(`        max rendered entities       <= ${LIMITS.entities}`)
console.log(`        max materials               <= ${LIMITS.materials}`)
console.log(`        max height                  <= ${LIMITS.heightM} m`)
console.log('        Only entities actually RENDERED count, so an empty world is far')
console.log('        below these and a full one approaches them. Creator Hub reports')
console.log('        the real numbers at publish time.')

console.log('\nLargest files shipping')
for (const f of files.slice(0, 6)) console.log(`        ${kb(f.bytes).padStart(9)}  ${f.rel}`)

console.log(`\n${failed ? 'PREFLIGHT FAILED' : 'Preflight passed'} — ${files.length} files, ${mb(total)}\n`)
process.exit(failed ? 1 : 0)
