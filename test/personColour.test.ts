import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blendColours, lighten, linkColour, personColour } from '../src/personColour.ts'
import type { Rgb } from '../src/personColour.ts'

const brightness = (c: Rgb) => (c.r + c.g + c.b) / 3
const distance = (a: Rgb, b: Rgb) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)

function population(n: number): Rgb[] {
  return Array.from({ length: n }, (_, i) => personColour(`0x${i.toString(16).padStart(40, '0')}`))
}

test('a person always gets the same colour', () => {
  // Derived, never stored: every client must reach the same colour independently
  // or the same link renders differently for two people looking at it.
  const a = personColour('0xabc')
  const b = personColour('0xabc')
  assert.deepEqual(a, b)
})

test('different people get different colours', () => {
  assert.notDeepEqual(personColour('0xabc'), personColour('0xdef'))
})

test('every colour stays inside 0..1', () => {
  for (const c of population(200)) {
    for (const channel of [c.r, c.g, c.b]) {
      assert.ok(channel >= 0 && channel <= 1, `channel ${channel} out of range`)
    }
  }
})

test('no colour is too dark to see against the ground', () => {
  // These are emissive marks on a near-black floor that gets darker at night.
  // A dark hue reads as unlit geometry rather than as somebody's mark.
  for (const c of population(200)) {
    assert.ok(brightness(c) > 0.35, `colour too dark to read: ${JSON.stringify(c)}`)
  }
})

test('no colour is so pale it loses its identity', () => {
  for (const c of population(200)) {
    assert.ok(brightness(c) < 0.92, `colour washed out to near-white: ${JSON.stringify(c)}`)
  }
})

test('a realistic lattice looks varied, not uniform', () => {
  // The point is that a structure built by many people LOOKS like it. Perfect
  // pairwise distinctness is not achievable by hashing — with N points in a
  // bounded colour space the closest pair inevitably shrinks as N grows, and
  // fixing it would need server-assigned hues. What matters is that the
  // population as a whole is visibly varied.
  const colours = population(60)
  let total = 0
  let pairs = 0
  for (let i = 0; i < colours.length; i++) {
    for (let j = i + 1; j < colours.length; j++) {
      total += distance(colours[i], colours[j])
      pairs += 1
    }
  }
  const mean = total / pairs
  assert.ok(mean > 0.4, `a lattice of 60 people averages only ${mean.toFixed(3)} apart — too uniform`)
})

test('an unknown participant reads as neutral, not as a specific person', () => {
  // Hue 0 would make every anonymous mark the same red, implying they are all
  // the same person.
  const unknown = personColour('')
  const known = personColour('0xabc')
  assert.notDeepEqual(unknown, known)
  assert.ok(Math.abs(unknown.r - unknown.g) < 0.15 && Math.abs(unknown.g - unknown.b) < 0.15, 'not neutral')
})

test('a link is the blend of the two people who made it', () => {
  const a = personColour('0xaaa')
  const b = personColour('0xbbb')
  const link = linkColour('0xaaa', '0xbbb')
  assert.deepEqual(link, blendColours(a, b))
})

test('link colour does not depend on which participant is stored first', () => {
  // A handshake is not something one person does to another. The same pair must
  // render identically whichever way round the record happens to be.
  assert.deepEqual(linkColour('0xaaa', '0xbbb'), linkColour('0xbbb', '0xaaa'))
})

test('a blended link is still bright enough to read', () => {
  for (let i = 0; i < 100; i++) {
    const c = linkColour(`0x${i}`, `0x${i + 500}`)
    assert.ok(brightness(c) > 0.35, `blend too dark: ${JSON.stringify(c)}`)
  }
})

// ---------- the earned mark ----------

test('a marked hand still says who left it', () => {
  // The mark must read as "special", not as "somebody else". Replacing the hue
  // would erase the identity, which is the part worth protecting.
  const owner = personColour('0xabc')
  const marked = lighten(owner, 0.4)
  assert.notDeepEqual(marked, owner, 'the mark is invisible')

  // Hue is preserved if the channel ORDER is unchanged — the same colour, lifted.
  const order = (c: Rgb) => [c.r >= c.g, c.g >= c.b, c.r >= c.b].join(',')
  assert.equal(order(marked), order(owner), 'lightening shifted the hue')
})

test('a marked hand is brighter than an unmarked one', () => {
  const owner = personColour('0xabc')
  assert.ok(brightness(lighten(owner, 0.4)) > brightness(owner))
})

test('lightening never leaves the valid range', () => {
  for (const amount of [-1, 0, 0.4, 1, 5]) {
    const c = lighten(personColour('0xabc'), amount)
    for (const channel of [c.r, c.g, c.b]) {
      assert.ok(channel >= 0 && channel <= 1, `channel ${channel} out of range at amount ${amount}`)
    }
  }
})

test('lightening by zero changes nothing', () => {
  const owner = personColour('0xabc')
  assert.deepEqual(lighten(owner, 0), owner)
})
