#!/usr/bin/env node
/**
 * Patches a bug in @dcl/sdk-commands that blocks deploying.
 *
 * The linker dApp — the local page that signs a deployment with your wallet —
 * proxies /auth/* to decentraland.org and forwards the incoming headers with:
 *
 *     headers: { ...ctx.request.headers, Host: domain, ... }
 *
 * `ctx.request.headers` is a web-standard Headers object, and spreading one does
 * NOT yield its header pairs — it yields the instance's internal symbol-keyed
 * slots. fetch then rejects the request, and the browser shows only:
 *
 *     Proxy error: init.headers is a symbol, which cannot be converted to a DOMString
 *
 * Reproduced identically on Node 22 and Node 24, so it is the library, not the
 * runtime. Object.fromEntries() converts the iterable properly.
 *
 * Lives here rather than as a hand edit because node_modules is not committed:
 * `npm ci` restores the broken file, and the next deploy fails the same way with
 * no memory of why. Idempotent — safe to run repeatedly.
 *
 *   node tools/patch-linker.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const TARGET = 'node_modules/@dcl/sdk-commands/dist/linker-dapp/routes.js'
const BROKEN = '...ctx.request.headers,'
const FIXED = '...toPlainHeaders(ctx.request.headers),'

const HELPER = `
// Added by tools/patch-linker.mjs — see that file for why.
// A Headers object does not spread into header pairs; it spreads into internal
// symbol slots, which fetch rejects.
function toPlainHeaders(headers) {
  if (!headers) return {}
  if (typeof headers.entries === 'function') return Object.fromEntries(headers.entries())
  return { ...headers }
}
`

if (!existsSync(TARGET)) {
  console.error(`  ${TARGET} not found — run npm ci first`)
  process.exit(1)
}

let source = readFileSync(TARGET, 'utf8')

if (source.includes('function toPlainHeaders')) {
  console.log('  already patched')
  process.exit(0)
}

if (!source.includes(BROKEN)) {
  // The upstream code changed. Better to fail loudly than to silently do
  // nothing and let the deploy break with the original confusing error.
  console.error('  expected code not found — @dcl/sdk-commands may have fixed or changed this.')
  console.error('  Try deploying without the patch; if it still fails, this script needs updating.')
  process.exit(1)
}

source = source.replace(BROKEN, FIXED) + HELPER
writeFileSync(TARGET, source)
console.log('  patched: header forwarding in the linker dApp proxy')
