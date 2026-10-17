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

function save(tools) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(toolsFile(), JSON.stringify(tools, null, 2))
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
}

// `id` is optional; pass one to re-register (overwrite) a known tool.
export function registerTool({ id, name, description = '', priceUsd, upstreamUrl, sandboxId = null, inputSchema = { type: 'object' } }) {
  if (!name) throw new Error('registerTool: name is required')
  if (!upstreamUrl) throw new Error('registerTool: upstreamUrl is required')
  if (!(Number(priceUsd) >= MIN_PRICE_USD)) throw new Error(`registerTool: priceUsd must be >= ${MIN_PRICE_USD}`)
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

export const getTool = (id) => load()[id]
export const listTools = () => Object.values(load())
