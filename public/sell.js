// Seller page: submit a tool, play the build as steps, and tick earnings as paid calls land.
import { coalesce, count, el, getJson, onEvents, reducedMotion, rollTo, usd } from '/app.js'

const $ = (id) => document.getElementById(id)
const form = $('sell-form'), log = $('log'), status = $('build-status'), msg = $('form-msg'), submitBtn = $('submit')
const ADMIN_KEY = 'vend-admin-token'
const BUTTON_SETTLE_MS = 2600
let currentJob = null
let submitted = false

try { $('admin').value = sessionStorage.getItem(ADMIN_KEY) || '' } catch {}

/* ───────── "Vend it" button: idle → loading → building → success | error ───────── */
const BUTTON_LABELS = { idle: 'Vend it', loading: 'Vending…', building: 'Building…', success: 'Live ✓', error: 'Try again' }
let settleTimer = null
function setButton(state) {
  clearTimeout(settleTimer)
  submitBtn.dataset.state = state
  submitBtn.firstElementChild.textContent = BUTTON_LABELS[state]
  submitBtn.disabled = state === 'loading' || state === 'building'
  if (state === 'success' || state === 'error') settleTimer = setTimeout(() => setButton('idle'), BUTTON_SETTLE_MS)
}

function setMsg(text, kind = '') {
  msg.className = `form-msg ${kind}`
  msg.textContent = text
}

$('load-example').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  btn.disabled = true
  try {
    const res = await fetch('/api/example')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    $('code').value = await res.text()
    $('name').value ||= 'chart'
    $('description').value ||= 'Render a bar or line chart and return it as a base64 PNG'
    setMsg('')
  } catch (err) {
    setMsg(`Could not load the example: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
  }
})

/* ───────── Step player: sandbox → write → lock → test ⇄ fix → green → live ───────── */
const STEPS = [['sandbox', 'Sandbox'], ['write', 'Write'], ['lock', 'Lock net'], ['test', 'Test'], ['fix', 'Fix'], ['green', 'Green'], ['live', 'Live']]
const GLYPHS = { pending: null, active: '•', done: '✓', fail: '✗', skip: '–', live: '✓' }
const steps = new Map()
let activeStep = null
let fixes = 0

function buildSteps() {
  $('steps').replaceChildren(...STEPS.map(([key, text], i) => {
    const pip = el('span', { class: 'pip', 'aria-hidden': 'true' }, String(i + 1))
    const label = el('span', {}, text)
    const li = el('li', { class: 'step', 'data-state': 'pending' }, pip, label)
    steps.set(key, { li, pip, label, index: i + 1, text })
    return li
  }))
}

function mark(key, state, text) {
  const step = steps.get(key)
  step.li.dataset.state = state
  step.pip.textContent = GLYPHS[state] ?? String(step.index)
  if (text) step.label.textContent = text
  step.li.setAttribute('aria-label', `${step.label.textContent}: ${state}`)
  if (state === 'active') activeStep = key
}

function resetSteps() {
  fixes = 0
  activeStep = null
  for (const [key, text] of STEPS) mark(key, 'pending', text)
}

const isPending = (key) => steps.get(key).li.dataset.state === 'pending'

// Maps the packager's real log lines (src/packager/index.js) onto steps.
function stepFromLine(line) {
  if (/^creating sandbox/.test(line)) return mark('sandbox', 'active')
  if (/^writing wrapper/.test(line)) return mark('sandbox', 'done'), mark('write', 'active')
  if (/^network locked/.test(line)) return mark('write', 'done'), mark('lock', 'done')
  if (/^running \d+ tests/.test(line)) {
    for (const key of ['sandbox', 'write']) mark(key, 'done')
    if (isPending('lock')) mark('lock', 'skip')
    if (fixes) mark('fix', 'done', `Fix ×${fixes}`)
    return mark('test', 'active')
  }
  if (/^test failed/.test(line)) return mark('test', 'fail')
  if (/^fixing/.test(line)) return (fixes++, mark('fix', 'active', `Fix ×${fixes}`))
  if (/^✅ .*passed/.test(line)) return mark('test', 'done'), mark('fix', fixes ? 'done' : 'skip'), mark('green', 'done')
  if (/^starting server/.test(line)) return mark('live', 'active')
  if (/^live ✅/.test(line)) return mark('live', 'live')
  if (/^giving up|failed:|^bad LLM reply/.test(line) && activeStep) mark(activeStep, 'fail')
}

/* ───────── The wait: one plain sentence for what is happening right now, plus elapsed time ───────── */
const NOW = [
  [/^creating sandbox/, 'Starting a fresh CreateOS sandbox for your tool.'],
  [/^writing wrapper/, 'An agent is writing a web server and tests around your code.'],
  [/^installing/, 'Installing your dependencies inside the sandbox.'],
  [/^network locked/, 'Dependencies are in. The sandbox network is now locked.'],
  [/^running \d+ tests/, 'Running the tests in the sandbox.'],
  [/^test failed/, 'Caught a bug before any buyer did. The agent is fixing it.', 'is-caught'],
  [/^fixing/, 'Rewriting the wrapper to fix the failing test.', 'is-caught'],
  [/^✅ .*passed/, 'All tests green.'],
  [/^starting server/, 'Starting your tool’s server.'],
  [/^live ✅/, 'Live. Agents can buy it now.', 'is-live'],
  [/^giving up/, 'The tests still fail after every retry. The last error is in the log above.', 'is-fail'],
]
function setNow(text, kind = '') {
  $('build-now').className = `build-now ${kind}`
  $('build-now').textContent = text
}
function nowFromLine(line) {
  const hit = NOW.find(([re]) => re.test(line))
  if (hit) setNow(hit[1], hit[2])
}

let clockStart = 0, clockTimer = null
const SECOND_MS = 1000
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / SECOND_MS) % 60).padStart(2, '0')}`
function startClock(ts) {
  if (clockTimer) return
  clockStart = Math.min(Date.parse(ts) || Date.now(), Date.now())
  const tick = () => setStatus(`building · ${mmss(Date.now() - clockStart)}`, 'running')
  tick()
  clockTimer = setInterval(tick, SECOND_MS)
}
function stopClock() {
  clearInterval(clockTimer)
  clockTimer = null
  const took = clockStart ? mmss(Date.now() - clockStart) : ''
  clockStart = 0
  return took
}

/* ───────── Build log ───────── */
function setStatus(text, kind = '') {
  status.textContent = text
  status.className = `status-pill ${kind}`
}

function classify(line) {
  if (/^live ✅|live at/.test(line)) return 'live'
  if (/✅|passed/.test(line)) return 'ok'
  if (/^test failed/.test(line)) return 'caught'
  if (/failed|giving up|error/i.test(line)) return 'fail'
  if (/network locked/.test(line)) return 'lock'
  if (/queued|^fixing|^writing|^creating|^installing|^starting/.test(line)) return 'muted'
  return ''
}

// A failing test can echo a whole base64 PNG; show the head and keep the full line in the tooltip.
const MAX_LOG_CHARS = 240
function logLine(text, kind = classify(text), ts = new Date().toISOString()) {
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const long = text.length > MAX_LOG_CHARS
  const shown = long ? `${text.slice(0, MAX_LOG_CHARS)}… (+${count(text.length - MAX_LOG_CHARS)} chars)` : text
  log.append(el('span', { class: `log-line ${kind}`, ...(long && { title: text }) }, el('span', { class: 't' }, time), shown))
  log.scrollTop = log.scrollHeight
}

function startJob(jobId) {
  currentJob = jobId
  log.replaceChildren()
  resetSteps()
}

/* ───────── Submit ───────── */
function firstInvalid() {
  for (const input of form.querySelectorAll('input, textarea')) input.removeAttribute('aria-invalid')
  const bad = form.querySelector(':invalid')
  if (bad) bad.setAttribute('aria-invalid', 'true')
  return bad
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const bad = firstInvalid()
  if (bad) {
    setMsg(`${form.querySelector(`label[for="${bad.id}"]`)?.textContent || 'A field'}: ${bad.validationMessage}`, 'error')
    return bad.focus()
  }
  const token = $('admin').value.trim()
  try { sessionStorage.setItem(ADMIN_KEY, token) } catch {}
  const body = { name: $('name').value.trim(), description: $('description').value.trim(), code: $('code').value, priceUsd: Number($('price').value) }
  setButton('loading')
  setMsg('Submitting…')
  try {
    const res = await fetch('/api/tools', { method: 'POST', headers: { 'content-type': 'application/json', ...(token && { 'x-vend-admin': token }) }, body: JSON.stringify(body) })
    const out = await res.json()
    if (res.status === 401) {
      $('admin').setAttribute('aria-invalid', 'true')
      $('admin').focus()
      throw new Error(token ? 'That admin token was not accepted. Check it and try again.' : 'This server needs an admin token to start builds. Enter it below.')
    }
    if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`)
    submitted = true
    // An early build.log for this job may already be on screen (SSE can beat the 202): keep it.
    if (currentJob !== out.jobId) startJob(out.jobId)
    logLine(`build ${out.jobId} queued for "${body.name}"`, 'muted')
    log.prepend(log.lastElementChild)
    startClock(new Date().toISOString())
    setNow('Queued. Starting a sandbox for your tool.')
    setButton('building')
    setMsg('Building. Watch the log.')
  } catch (err) {
    setMsg(err.message, 'error')
    setButton('error')
  }
})

function onBuild(event, isLive) {
  const { jobId, line, ok, path, error, attempts } = event.data || {}
  // Follow the latest build until this tab submits its own, then follow only that one.
  if (jobId !== currentJob) {
    if (submitted) return
    startJob(jobId)
  }
  if (event.type === 'build.log') {
    logLine(line, undefined, event.ts)
    stepFromLine(line)
    nowFromLine(line)
    return isLive ? startClock(event.ts) : setStatus('building', 'running')
  }
  const took = stopClock()
  if (ok) {
    setNow(`Live${took && ` after ${took}`}. Agents can buy it now.`, 'is-live')
    logLine(`✅ verified in ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} · live at ${location.origin}${path}`, 'live', event.ts)
    mark('green', 'done')
    mark('live', 'live')
    setStatus('live', 'ok')
  } else {
    logLine(`build failed: ${error || 'unknown error'}`, 'fail', event.ts)
    setNow(`The build failed: ${error || 'unknown error'}. Fix the code or load the example, then press Try again.`, 'is-fail')
    if (activeStep) mark(activeStep, 'fail')
    setStatus('failed', 'fail')
  }
  if (!submitted) return
  setButton(ok ? 'success' : 'error')
  setMsg(ok ? 'Live. Agents can buy it now.' : 'The build did not pass. Fix the code and try again.', ok ? 'ok' : 'error')
}

/* ───────── Ledger: one row per PaymentIntent; BLOCKED stays sticky through its refund ───────── */
const rows = new Map()
const BADGES = {
  'call.paid': ['paid', 'paid'],
  'call.ok': ['paid', '✓ paid'],
  'call.failed': ['failed', '✗ failed'],
  'call.blocked': ['blocked', '⛔ BLOCKED'],
  'call.refunded': ['refunded', '↩ refunded'],
  'call.refund_failed': ['blocked', '⚠ refund failed'],
}

function ledgerRow(key, d, isLive) {
  let row = rows.get(key)
  if (row) return row
  $('no-calls')?.remove()
  row = { badge: el('span', { class: 'badge' }), split: el('td', { class: 'num' }, '…'), sub: el('span', { class: 'sub' }), blocked: false }
  const tool = el('span', { class: 'sub tool-id' }, d.toolId || '?')
  row.tr = el('tr', { class: isLive ? 'row-in' : '' }, el('td', {}, row.badge, tool, row.sub), row.split)
  $('calls').prepend(row.tr)
  rows.set(key, row)
  return row
}

function onCall(event, isLive) {
  const d = event.data || {}
  const row = ledgerRow(d.paymentIntent || `${event.ts}-${Math.random()}`, d, isLive)
  let [kind, label] = BADGES[event.type]
  if (event.type === 'call.blocked') row.blocked = true
  if (row.blocked && event.type === 'call.refunded') [kind, label] = ['blocked', '⛔ BLOCKED · refunded']
  else if (row.blocked && event.type !== 'call.refund_failed') [kind, label] = ['blocked', '⛔ BLOCKED']
  row.tr.dataset.kind = kind
  row.badge.className = `badge ${kind}`
  row.badge.textContent = label
  // Keep the first error (e.g. the blocked reason) visible after the refund event lands.
  if (d.error) row.sub.textContent = String(d.error).slice(0, 80)
  else if (!row.sub.textContent) row.sub.textContent = new Date(event.ts).toLocaleTimeString()
  if (event.type === 'call.ok' && d.ledger) row.split.replaceChildren(`+${usd(d.ledger.sellerCents)}`, el('span', { class: 'sub' }, `vend ${usd(d.ledger.vendCents)}`))
  if (event.type === 'call.refunded') row.split.textContent = `−${usd(Math.round(Number(d.amountUsd || 0) * 100))}`
  if (event.type === 'call.ok' && isLive && d.ledger) floatDelta(d.ledger.sellerCents)
  if (event.type === 'call.blocked' && isLive) pop(row.badge)
}

// The paid → BLOCKED swap is the trust moment of the demo; a 200ms settle makes the change legible.
function pop(node) {
  if (reducedMotion()) return
  node.animate([{ transform: 'scale(0.92)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
}

/* ───────── Earnings ───────── */
function floatDelta(cents) {
  if (reducedMotion()) return
  const hero = $('earn-hero')
  const strong = $('s-seller')
  const delta = el('span', { class: 'delta', 'aria-hidden': 'true' }, `+${usd(cents)}`)
  delta.style.setProperty('--dx', `${strong.offsetWidth + 12}px`)
  hero.append(delta)
  delta.addEventListener('animationend', () => delta.remove())
}

const LONG_AMOUNT_CHARS = 9 // "$9,999.99"; longer totals step the hero number down a size
async function refreshStats() {
  try {
    const s = await getJson('/api/stats')
    const seller = $('s-seller')
    seller.dataset.long = String(usd(s.sellerCents).length > LONG_AMOUNT_CHARS)
    if (rollTo(seller, s.sellerCents, usd)) {
      seller.classList.add('tick')
      requestAnimationFrame(() => requestAnimationFrame(() => seller.classList.remove('tick')))
    }
    rollTo($('s-vend'), s.vendCents, usd)
    rollTo($('s-refunded'), s.refundedCents, usd)
    rollTo($('s-blocked'), s.blocked)
  } catch (err) {
    console.error(err)
  }
}

const scheduleStats = coalesce(refreshStats)
buildSteps()
refreshStats()
const source = onEvents((event, isLive) => {
  if (event.type.startsWith('build.')) return onBuild(event, isLive)
  if (BADGES[event.type]) {
    onCall(event, isLive)
    scheduleStats()
  }
})
source.addEventListener('error', () => setMsg('Live feed lost. Reconnecting…', 'error'))
source.addEventListener('open', () => { if (/^Live feed lost/.test(msg.textContent)) setMsg('Live feed back.', 'ok') })
