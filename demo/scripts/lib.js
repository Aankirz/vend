import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT = path.resolve(DEMO, '..')
export const BUILD = path.join(DEMO, 'build')
export const OUT = path.join(DEMO, 'out')

export function readEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

// Every captured string passes through here before it can reach a frame.
const SECRET_PATTERNS = [/\b(sk|rk)_(test|live)_[A-Za-z0-9]+/g, /\bvck_[A-Za-z0-9_-]+/g, /\bskp_[A-Za-z0-9_-]+/g, /[\w.+-]+@[\w-]+\.[\w.]+/g]
export function redact(text) {
  const token = readEnv().VEND_ADMIN_TOKEN
  let out = SECRET_PATTERNS.reduce((s, re) => s.replace(re, '[redacted]'), String(text))
  if (token) out = out.split(token).join('[redacted]')
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const assert = (await import('node:assert')).strict
  assert.equal(redact('key sk_test_abc123 and vck_x-y and skp_9 for a@b.com'), 'key [redacted] and [redacted] and [redacted] for [redacted]')
  assert.equal(redact('pi_123 ok'), 'pi_123 ok')
  console.log('lib ok')
}
