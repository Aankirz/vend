// Shared helpers for the Vend pages. Every dynamic string goes through textContent.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value)
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const INT = new Intl.NumberFormat('en-US')
export const usd = (cents) => USD.format(cents / 100)
export const count = (n) => INT.format(n)
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
const COPY_RESET_MS = 1500

function copyButton(text) {
  const btn = el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Copy to clipboard' }, 'Copy')
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copied'
      btn.classList.add('is-copied')
    } catch {
      btn.textContent = 'Select & copy'
    }
    setTimeout(() => {
      btn.textContent = 'Copy'
      btn.classList.remove('is-copied')
    }, COPY_RESET_MS)
  })
  return btn
}

export function buyerSnippets(tool) {
  const body = JSON.stringify(tool.example ?? {})
  return [
    ['node', `node scripts/buyer.js ${tool.url} ${shellQuote(body)}`],
    ['npx', `MPPX_STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY npx mppx ${tool.url} -J ${shellQuote(body)} -M paymentMethod=pm_card_visa -i`],
    ['agent', `Use Vend tool ${tool.url}: pay with scripts/buyer.js and chart my revenue`],
  ]
}

export function toolCard(tool) {
  const snippets = buyerSnippets(tool).map(([label, text]) =>
    el('div', { class: 'snippet' }, el('span', { class: 'snippet-label' }, label), el('code', {}, text), copyButton(text)),
  )
  return el('article', { class: 'tool' },
    el('div', { class: 'tool-head' },
      el('h3', { class: 'tool-name' }, tool.name),
      el('span', { class: 'price' }, `${usd(Math.round(Number(tool.priceUsd) * 100))} / call`),
      el('p', { class: 'tool-desc' }, tool.description || 'No description.'),
    ),
    el('div', { class: 'snippets' }, snippets),
  )
}

// ponytail: plain show-all, paginate if the list ever reaches thousands.
const TOOLS_SHOWN = 6
export async function renderTools(container) {
  try {
    const tools = await getJson('/api/tools')
    if (!tools.length) return container.replaceChildren(el('div', { class: 'empty' }, 'No tools are live yet. ', el('a', { href: '/sell' }, 'Vend the first one →')))
    container.replaceChildren(...tools.slice(0, TOOLS_SHOWN).map(toolCard))
    if (tools.length > TOOLS_SHOWN) {
      const more = el('button', { class: 'btn show-all', type: 'button' }, `Show all ${count(tools.length)} tools`)
      more.addEventListener('click', () => more.replaceWith(...tools.slice(TOOLS_SHOWN).map(toolCard)))
      container.append(more)
    }
  } catch (err) {
    container.replaceChildren(el('div', { class: 'empty' }, `Could not load tools: ${err.message}`))
  }
}

// Calls fn(event, isLive) for the backlog and every live event; EventSource reconnects on its own.
// isLive is false for replayed history, so pages can skip celebration animations for old calls.
const LIVE_WINDOW_MS = 5000
export function onEvents(fn) {
  const openedAt = Date.now()
  const source = new EventSource('/api/events')
  source.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data)
      fn(event, Date.parse(event.ts) > openedAt - LIVE_WINDOW_MS)
    } catch (err) {
      console.error('bad event', err)
    }
  }
  return source
}

// Coalesces bursts (the SSE backlog replays up to 50 events) into one call after things go quiet.
export function coalesce(fn, waitMs = 250) {
  let timer = null
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, waitMs)
  }
}

const ROLL_MS = 700
// Rolls a number up (or down) to `value`, formatting each frame. Returns true when the value changed.
export function rollTo(node, value, format = count) {
  if (!node) return false
  const from = Number(node.dataset.value ?? value)
  node.dataset.value = String(value)
  if (from === value) {
    node.textContent = format(value)
    return false
  }
  if (reducedMotion()) {
    node.textContent = format(value)
    return true
  }
  const start = performance.now()
  const frame = (now) => {
    const t = Math.min(1, (now - start) / ROLL_MS)
    const eased = 1 - Math.pow(1 - t, 4)
    node.textContent = format(Math.round(from + (value - from) * eased))
    if (t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return true
}
