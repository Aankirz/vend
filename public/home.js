// Landing page: live totals, the vending machine, try-it, hairline figures, live tools.
import { coalesce, cooldown, getJson, onEvents, reducedMotion, renderTools, rollTo, runTry, usd } from '/app.js'

const $ = (id) => document.getElementById(id)
const list = $('tool-list')
const vm = $('vm')
const VEND_MS = 3200
const VEND_HOLD_MS = 2500
let tools = []

/* ───────── Live totals ───────── */
async function refreshStats() {
  try {
    const s = await getJson('/api/stats')
    rollTo($('c-seller'), s.sellerCents, usd)
    rollTo($('c-paid'), s.paidCalls)
    rollTo($('c-refunds'), s.refunds)
    rollTo($('c-blocked'), s.blocked)
  } catch (err) {
    console.error(err)
  }
}

/* ───────── Fig. 00 · the machine vends: coin → 402 → item drops → receipt → +$0.45 ───────── */
let vendTimer = null
function vend(blocked = false) {
  clearTimeout(vendTimer)
  vm.classList.remove('is-vending', 'is-blocked')
  vm.getBoundingClientRect() // restart the CSS animations
  vm.classList.add(blocked ? 'is-blocked' : 'is-vending')
  vendTimer = setTimeout(() => vm.classList.remove('is-vending', 'is-blocked'), VEND_MS + VEND_HOLD_MS)
}
vm.addEventListener('click', () => vend())

/* ───────── Try a paid / malicious call from the hero ───────── */
const heroTool = () => tools.find((t) => /chart/i.test(t.name)) || tools[0]
function heroTry(btn, evil) {
  const label = btn.textContent
  btn.addEventListener('click', async () => {
    const tool = heroTool()
    const panel = $('hero-try')
    if (!tool) {
      panel.hidden = false
      return panel.replaceChildren(Object.assign(document.createElement('p'), { className: 'try-out', textContent: 'No tool is live yet, so there is nothing to buy. Vend the first one on /sell.' }))
    }
    for (const b of [$('try-paid'), $('try-evil')]) b.disabled = true
    const out = await runTry(panel, tool, { evil, onStep: (step) => step.t === 'result' && vend(step.blocked || !step.ok) })
    for (const b of [$('try-paid'), $('try-evil')]) b.disabled = false
    if (out.status === 429) cooldown(btn, out.retryAfter, label)
  })
}
heroTry($('try-paid'), false)
heroTry($('try-evil'), true)

/* ───────── Hairline figures: mount when visible, destroy when not ───────── */
let hairline = null
const figures = new Map()
const io = new IntersectionObserver(async (entries) => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) {
      figures.get(target)?.destroy()
      figures.delete(target)
      continue
    }
    hairline ||= import('/lib/hairline.js')
    const mod = await hairline
    if (!figures.has(target)) figures.set(target, mod[target.dataset.fig](target, { play: !reducedMotion(), intensity: 0.6, label: target.dataset.label }))
  }
}, { rootMargin: '120px' })
document.querySelectorAll('.hl').forEach((node) => io.observe(node))

/* ───────── Boot ───────── */
async function loadTools() {
  try {
    tools = await getJson('/api/tools')
  } catch {
    tools = []
  }
  await renderTools(list)
  list.removeAttribute('aria-busy')
}

const scheduleStats = coalesce(refreshStats)
refreshStats()
loadTools()
if (!reducedMotion()) setTimeout(vend, 900)
const source = onEvents((event) => {
  if (event.type.startsWith('call.')) scheduleStats()
  if (event.type === 'build.done' && event.data?.ok) loadTools()
})
const sse = $('sse-state')
source.addEventListener('error', () => { sse.textContent = 'live feed reconnecting…' })
source.addEventListener('open', () => { sse.textContent = '' })
