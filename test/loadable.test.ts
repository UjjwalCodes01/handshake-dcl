import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Every module that is supposed to be testable must actually load in Node.
 *
 * Two traps have already been hit here, both of which pass typecheck and pass
 * the DCL build, then fail only at runtime:
 *
 *  1. Non-erasable TypeScript (a constructor parameter property, a `const
 *     enum`). Node strips types, it never transforms, so anything that
 *     GENERATES code makes the module unloadable. `erasableSyntaxOnly` now
 *     catches this at typecheck.
 *  2. An extensionless relative import. Node's ESM resolver requires the
 *     extension; esbuild and tsc do not. Every pure module happened to have no
 *     relative imports until offers.ts, whose whole test file failed to load
 *     with zero assertions run — which looks alarmingly like a passing suite if
 *     you only read the summary line.
 *
 * This test is the guard. If a pure module stops loading, it fails here loudly
 * rather than silently taking its own test file down with it.
 */
const PURE_MODULES = [
  '../src/hash.ts',
  '../src/daylight.ts',
  '../src/placement.ts',
  '../src/sync-ids.ts',
  '../src/config.ts',
  '../src/net/address.ts',
  '../src/net/pending.ts',
  '../src/net/writeQueue.ts',
  '../src/server/records.ts',
  '../src/server/guards.ts',
  '../src/server/names.ts',
  '../src/server/ranking.ts',
  '../src/systems/echoMachine.ts',
  '../src/systems/offers.ts',
  '../src/ui/relativeTime.ts'
]

for (const path of PURE_MODULES) {
  test(`${path} loads in Node`, async () => {
    const mod = await import(path)
    assert.ok(
      Object.keys(mod).length > 0,
      `${path} loaded but exported nothing — check it is the module you meant`
    )
  })
}
