import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Eligibility requirements that are checkable from the repository.
 *
 * These are not code quality — they decide whether the submission is judged at
 * all. A scene that scores well but fails an eligibility line scores nothing,
 * and every one of these is the kind of thing that is trivially true today and
 * quietly broken three commits later.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = JSON.parse(readFileSync(join(ROOT, 'scene.json'), 'utf8')) as Record<string, any>

test('the project is open source with a license file', () => {
  // "Open source in a public GitHub repository" is an eligibility requirement,
  // and a repo with no license is not open source in any usable sense.
  assert.ok(existsSync(join(ROOT, 'LICENSE')), 'LICENSE is missing')
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /MIT License/, 'LICENSE does not look like a recognised license')
  assert.ok(!/\[year\]|\[fullname\]|YOUR NAME/i.test(license), 'LICENSE still has placeholders')
})

test('a README exists and is not a stub', () => {
  // Judges read it before they read code.
  const path = join(ROOT, 'README.md')
  assert.ok(existsSync(path), 'README.md is missing')
  assert.ok(readFileSync(path, 'utf8').length > 1500, 'README.md is too thin to be useful')
})

test('the scene targets a World, not LAND', () => {
  // "Deployed to a Decentraland World (not LAND)" is an eligibility line.
  assert.ok(scene.worldConfiguration?.name, 'no worldConfiguration.name — this would deploy as LAND')
})

test('the scene is a standalone persistent experience', () => {
  // "Works as a persistent standalone experience — no scheduled event, host,
  // performer or moderator required." Without the Multiplayer Server there is
  // no persistence at all, and the world resets to empty every time.
  assert.equal(scene.authoritativeMultiplayer, true)
})

test('no secrets are committed anywhere in the repo', () => {
  // The repo is public. This is cheap to check and catastrophic to miss.
  const files = ['scene.json', 'package.json', 'README.md', 'DEPLOYMENT.md', 'SUBMISSION.md']
  const forbidden = /(-----BEGIN [A-Z ]*PRIVATE KEY|mnemonic\s*[:=]|private[_-]?key\s*[:=])/i
  for (const file of files) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue
    assert.ok(!forbidden.test(readFileSync(path, 'utf8')), `${file} appears to contain a secret`)
  }
})

test('the submission package names the same world as the scene', () => {
  // A submission pointing at a different world than the one deployed is a
  // silent, total failure: judges open an empty realm and score what they see.
  const submission = readFileSync(join(ROOT, 'SUBMISSION.md'), 'utf8')
  const world: string = scene.worldConfiguration.name
  assert.ok(
    submission.includes(world),
    `SUBMISSION.md does not mention ${world}, so its demo link may point elsewhere`
  )
})
