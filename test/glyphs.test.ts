import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Every on-screen glyph must be in the Basic Multilingual Plane.
 *
 * Learned from a real phone, not from documentation. The mobile client rendered
 * NOTHING for astral-plane emoji: the handshake counter showed "0" instead of
 * "◆ 0", and the waiting indicator showed "..." — the U+2026 beside it survived
 * while the U+1F464 vanished. The main action button was blank, which for a
 * scene whose entire interaction is "tap the button" is total failure.
 *
 * It typechecks, builds, and looks perfect in every desktop preview. Only a
 * phone shows it. So the rule is enforced here instead.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const hud = readFileSync(join(ROOT, 'src/ui/hud.tsx'), 'utf8')

function glyphs(): Array<[string, number[]]> {
  const out: Array<[string, number[]]> = []
  for (const m of hud.matchAll(/(GLYPH_[A-Z_]+|PIP_[A-Z]+) = '([^']+)'/g)) {
    const points = [...m[2].matchAll(/\\u\{([0-9A-Fa-f]+)\}/g)].map((x) => parseInt(x[1], 16))
    out.push([m[1], points])
  }
  return out
}

test('the HUD defines glyphs', () => {
  assert.ok(glyphs().length >= 10, 'glyph constants not found — has the HUD been restructured?')
})

test('no glyph uses an astral-plane character', () => {
  // > U+FFFF is where emoji live, and the mobile client draws none of them.
  for (const [name, points] of glyphs()) {
    const astral = points.filter((p) => p > 0xffff)
    assert.equal(
      astral.length,
      0,
      `${name} uses ${astral.map((p) => `U+${p.toString(16).toUpperCase()}`).join(' ')} — invisible on the mobile client`
    )
  }
})

test('every glyph is written as an escape, never a literal', () => {
  // A pasted literal emoji would sail past the check above, and JSX attribute
  // strings do not process escapes either — both failure modes are invisible
  // until someone looks at a phone.
  for (const m of hud.matchAll(/(GLYPH_[A-Z_]+|PIP_[A-Z]+) = '([^']+)'/g)) {
    assert.match(m[2], /^(\\u\{[0-9A-Fa-f]+\})+$/, `${m[1]} is not written purely as \\u{...} escapes`)
  }
})

test('glyphs are drawn from ranges the client renders as text', () => {
  // Geometric shapes, arrows and mathematical operators are text-presentation.
  // Dingbats and Miscellaneous Symbols often default to EMOJI presentation,
  // which is what disappeared.
  const SAFE: Array<[number, number]> = [
    [0x2013, 0x2027], // punctuation, incl. the ellipsis that did render
    [0x2190, 0x21ff], // arrows
    [0x2200, 0x22ff], // mathematical operators
    [0x2500, 0x257f], // box drawing
    [0x25a0, 0x25ff], // geometric shapes
    [0x2700, 0x27bf], // dingbats — text-presentation ones only
    [0x27f0, 0x27ff] // supplemental arrows
  ]
  for (const [name, points] of glyphs()) {
    for (const p of points) {
      const ok = SAFE.some(([lo, hi]) => p >= lo && p <= hi)
      assert.ok(ok, `${name} uses U+${p.toString(16).toUpperCase()}, outside the ranges known to render`)
    }
  }
})
