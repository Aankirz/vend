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

export const usd = (cents) => `$${(cents / 100).toFixed(2)}`

export async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

function copyButton(text) {
  const btn = el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Copy to clipboard' }, 'Copy')
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copied'
    } catch {
      btn.textContent = 'Select & copy'
    }
    setTimeout(() => (btn.textContent = 'Copy'), 1500)
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
      el('span', { class: 'tool-name' }, tool.name),
      el('span', { class: 'price' }, `$${Number(tool.priceUsd).toFixed(2)} / call`),
    ),
    el('p', { class: 'tool-desc' }, tool.description || 'No description.'),
    el('div', { class: 'snippets' }, snippets),
  )
}

export async function renderTools(container) {
  try {
    const tools = await getJson('/api/tools')
    container.replaceChildren(...(tools.length
      ? tools.map(toolCard)
      : [el('div', { class: 'empty' }, 'No tools live yet. ', el('a', { href: '/sell' }, 'Vend the first one →'))]))
  } catch (err) {
    container.replaceChildren(el('div', { class: 'empty' }, `Could not load tools: ${err.message}`))
  }
}

// Calls fn(event) for the backlog and every live event; EventSource reconnects on its own.
export function onEvents(fn) {
  const source = new EventSource('/api/events')
  source.onmessage = (msg) => {
    try {
      fn(JSON.parse(msg.data))
    } catch (err) {
      console.error('bad event', err)
    }
  }
  return source
}

export function setCounter(node, text) {
  if (!node || node.textContent === text) return
  node.textContent = text
  node.classList.remove('bump')
  void node.offsetWidth // restart the animation
  node.classList.add('bump')
}
