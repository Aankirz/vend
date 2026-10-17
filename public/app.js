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
  const panel = el('div', { class: 'try-panel', hidden: '' })
  const tryBtn = (label, evil) => {
    const btn = el('button', { class: `btn btn-sm ${evil ? 'btn-evil' : 'btn-try'}`, type: 'button' }, label)
    btn.addEventListener('click', async () => {
      btn.disabled = true
      const out = await runTry(panel, tool, { evil })
      if (out.status === 429) return cooldown(btn, out.retryAfter, label)
      btn.disabled = false
    })
    return btn
  }
  return el('article', { class: 'tool' },
    el('div', { class: 'tool-head' },
      el('h3', { class: 'tool-name' }, tool.name),
      el('span', { class: 'price' }, `${usd(Math.round(Number(tool.priceUsd) * 100))} / call`),
      el('p', { class: 'tool-desc' }, tool.description || 'No description.'),
      el('div', { class: 'tool-try' }, tryBtn('Try a paid call', false), tryBtn('Try a malicious call', true)),
    ),
    el('div', { class: 'snippets' }, panel, el('details', { class: 'snippet-box' }, el('summary', {}, 'Call it from a terminal or agent'), snippets)),
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

/* ───────── Try it: Vend buys from its own gateway; the steps land one by one ───────── */
const STEP_GAP_MS = 420
const TICK_MS = 100
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_IMAGE_CHARS = 3_000_000
const DEFAULT_RETRY_S = 10
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms))

function stepRow(kind, label) {
  const row = el('li', { class: 'try-step', 'data-kind': kind }, el('span', { class: 'try-dot', 'aria-hidden': 'true' }), el('span', { class: 'try-label' }, label))
  return row
}

function resultNode(step) {
  if (step.blocked) return el('p', { class: 'try-out is-blocked' }, `⛔ BLOCKED · ${step.refunded === false ? 'refund pending' : 'refunded'} — ${String(step.error).slice(0, 140)}`)
  if (!step.ok) return el('p', { class: 'try-out is-failed' }, `✗ ${String(step.error || 'tool failed').slice(0, 140)} · ${step.refunded === false ? 'refund pending' : 'refunded'}`)
  const raw = typeof step.result === 'string' ? step.result : step.result?.image ?? step.result?.png
  if (typeof raw === 'string' && raw.length < MAX_IMAGE_CHARS && BASE64.test(raw)) {
    return el('img', { class: 'try-img', src: `data:image/png;base64,${raw}`, alt: 'Chart returned by the paid call', width: '480', height: '320' })
  }
  return el('pre', { class: 'try-out' }, JSON.stringify(step.result, null, 2).slice(0, 600))
}

function describe(step) {
  if (step.t === 'request') return ['req', 'POST sent, no payment attached']
  if (step.t === '402') return ['402', `402 Payment Required · ${usd(Math.round((step.amountUsd || 0) * 100))}`]
  if (step.t === 'paid') return ['paid', `paid · ${step.paymentIntent || 'receipt'}`]
  if (step.blocked) return ['blocked', 'tool tried to reach the internet · blocked']
  return step.ok ? ['ok', '200 OK · result delivered'] : ['failed', 'tool failed · buyer refunded']
}

// Renders into `panel` and resolves with the final step (or null on an HTTP error).
export async function runTry(panel, tool, { evil = false, onStep = () => {} } = {}) {
  const list = el('ol', { class: 'try-steps' })
  const waiting = stepRow('active', 'calling the tool without paying…')
  const clock = el('span', { class: 'try-clock' }, '0.0 s')
  waiting.append(clock)
  list.append(waiting)
  panel.replaceChildren(list)
  panel.hidden = false
  const started = performance.now()
  const timer = setInterval(() => { clock.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s` }, TICK_MS)
  let res, body
  try {
    res = await fetch(`/api/try/${encodeURIComponent(tool.id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evil ? { evil: true } : {}) })
    body = await res.json().catch(() => ({}))
  } catch (err) {
    body = { error: `network error: ${err.message}` }
  } finally {
    clearInterval(timer)
  }
  if (!res?.ok) {
    waiting.dataset.kind = 'failed'
    waiting.querySelector('.try-label').textContent = res?.status === 429 ? body.error || 'Too many demo calls. Try again shortly.' : res?.status === 404 ? 'Try-it is not available on this server yet.' : body.error || `HTTP ${res?.status}`
    return { status: res?.status ?? 0, retryAfter: Number(res?.headers.get('retry-after')) || DEFAULT_RETRY_S }
  }
  waiting.remove()
  let last = null
  for (const step of body.steps || []) {
    const [kind, label] = describe(step)
    list.append(stepRow(kind, label))
    onStep(step)
    last = step
    if (step.t === 'result') list.after(resultNode(step))
    await wait(STEP_GAP_MS)
  }
  return { status: 200, last }
}

// A button that counts down after a 429 instead of failing silently.
export function cooldown(btn, seconds, label) {
  btn.disabled = true
  let left = seconds
  const tick = () => {
    if (left <= 0) return (btn.disabled = false, (btn.textContent = label))
    btn.textContent = `Try again in ${left--} s`
    setTimeout(tick, 1000)
  }
  tick()
}
