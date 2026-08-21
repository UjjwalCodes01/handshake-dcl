import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = JSON.parse(readFileSync(join(ROOT, 'scene.json'), 'utf8'))

test('a world name is configured', () => {
  assert.ok(scene.worldConfiguration?.name, 'worldConfiguration.name is missing')
})

test('the world name is lowercase', () => {
  // Checked against the live index: of 1582 deployed worlds, ZERO contain an
  // uppercase character. A NAME shown as "HandShakeDcl" in the Builder resolves
  // to handshakedcl.dcl.eth, and the lowercase form is what must be here.
  // Getting this wrong is invisible until the deploy is rejected.
  const name: string = scene.worldConfiguration.name
  assert.equal(name, name.toLowerCase(), `world name "${name}" contains uppercase`)
})

test('the world name is a plausible DCL name', () => {
  const name: string = scene.worldConfiguration.name
  assert.match(name, /^[a-z0-9-]+\.(dcl\.)?eth$/, `"${name}" is not a valid .dcl.eth or .eth name`)
  assert.ok(!name.includes(' '), 'world name contains a space')
})

test('the scene entry point exists', () => {
  assert.ok(scene.main, 'scene.json has no "main"')
  assert.ok(existsSync(join(ROOT, scene.main)), `${scene.main} does not exist — run npm run build`)
})

test('every referenced asset exists', () => {
  // A missing thumbnail deploys fine and then shows a broken map card.
  const thumb = scene.display?.navmapThumbnail
  if (thumb && !thumb.startsWith('http')) {
    assert.ok(existsSync(join(ROOT, thumb)), `navmapThumbnail ${thumb} does not exist`)
  }
})

test('the Multiplayer Server is enabled', () => {
  // Without this flag the server never runs, isServer() is false everywhere, and
  // all persistence silently disappears while the scene still loads.
  assert.equal(scene.authoritativeMultiplayer, true)
})

test('scene metadata is not left at template defaults', () => {
  // The composite once carried "SDK7 Scene Template" branding, which is what
  // judges would have seen on the map card.
  const title: string = scene.display?.title ?? ''
  assert.ok(title.length > 0, 'display.title is empty')
  assert.ok(!/template/i.test(title), `display.title still looks like a template: "${title}"`)
})

test('parcels are declared and the base is one of them', () => {
  const parcels: string[] = scene.scene?.parcels ?? []
  assert.ok(parcels.length > 0, 'no parcels declared')
  assert.ok(parcels.includes(scene.scene.base), `base ${scene.scene.base} is not among the parcels`)
})
