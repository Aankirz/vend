import fs from 'node:fs'
import path from 'node:path'

// ponytail: in-memory tail only; the full history lives in data/events.jsonl.
const MAX_IN_MEMORY = 1000

const buffer = []
const listeners = new Set()
const eventsFile = () => path.join(process.env.VEND_DATA_DIR || 'data', 'events.jsonl')

export function emit(type, data = {}) {
  const event = { type, data, ts: new Date().toISOString() }
  buffer.push(event)
  if (buffer.length > MAX_IN_MEMORY) buffer.shift()
  fs.mkdirSync(path.dirname(eventsFile()), { recursive: true })
  fs.appendFileSync(eventsFile(), JSON.stringify(event) + '\n')
  for (const fn of listeners) {
    try {
      fn(event)
    } catch (err) {
      console.error('[events] listener failed:', err)
    }
  }
  return event
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const recent = (n = 50) => buffer.slice(-n)
