import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Stripe's minimum card charge via SPT; mppx refuses to offer anything lower.
const MIN_PRICE_USD = 0.5

const dataDir = () => process.env.VEND_DATA_DIR || 'data'
const toolsFile = () => path.join(dataDir(), 'tools.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(toolsFile(), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
}

// Atomic write: packager and gateway share this file, so never leave it half-written.
function save(tools) {
  fs.mkdirSync(dataDir(), { recursive: true })
  const tmp = `${toolsFile()}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(tools, null, 2))
  fs.renameSync(tmp, toolsFile())
}

function validPrice(priceUsd) {
  const n = Number(priceUsd)
  const cents = n * 100
  return Number.isFinite(n) && n >= MIN_PRICE_USD && Math.abs(cents - Math.round(cents)) < 1e-9
}

function validUpstream(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
}

// `id` is optional; pass one to re-register (overwrite) a known tool.
export function registerTool({ id, name, description = '', priceUsd, upstreamUrl, sandboxId = null, inputSchema = { type: 'object' } }) {
  if (!name) throw new Error('registerTool: name is required')
  if (!validUpstream(upstreamUrl)) throw new Error('registerTool: upstreamUrl must be an http(s) URL')
  if (!validPrice(priceUsd)) throw new Error(`registerTool: priceUsd must be whole cents and >= ${MIN_PRICE_USD}`)
  const tool = {
    id: id || `${slug(name)}-${crypto.randomBytes(3).toString('hex')}`,
    name,
    description,
    priceUsd: Number(priceUsd),
    upstreamUrl: upstreamUrl.replace(/\/+$/, ''),
    sandboxId,
    inputSchema,
    createdAt: new Date().toISOString(),
  }
  save({ ...load(), [tool.id]: tool })
  return tool
}

export function getTool(id) {
  const tools = load()
  return Object.hasOwn(tools, id) ? tools[id] : undefined
}
export const listTools = () => Object.values(load())
