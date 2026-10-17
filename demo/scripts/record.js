// Records every product segment of the demo with Playwright's own video recorder.
// usage: node scripts/record.js <baseUrl> <segment...>   segments: hero build buy evil projects stripe
// Writes build/<segment>.webm plus build/<segment>.json (timed marks the renderer cuts on).
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { redact, ROOT, BUILD, readEnv } from './lib.js'
import { terminalHtml } from './terminal.js'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SIZE = { width: 1920, height: 1080 }
const BUILD_TIMEOUT_MS = 10 * 60_000
const REVENUE = { data: [{ label: 'Jul', value: 120 }, { label: 'Aug', value: 180 }, { label: 'Sep', value: 260 }], title: 'Revenue', kind: 'bar' }
const EVIL = { ...REVENUE, source_url: 'https://example.com/revenue.json' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const save = (name, data) => fs.writeFileSync(path.join(BUILD, `${name}.json`), JSON.stringify(data, null, 2))
const load = (name) => JSON.parse(fs.readFileSync(path.join(BUILD, `${name}.json`), 'utf8'))

// One browser context per segment so each gets its own video file; `t()` is seconds since recording began.
async function record(browser, name, fn) {
  const dir = fs.mkdtempSync(path.join(BUILD, 'rec-'))
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE } })
  const page = await context.newPage()
  const t0 = Date.now()
  const t = () => (Date.now() - t0) / 1000
  const marks = await fn(page, t)
  await context.close()
  await page.video().saveAs(path.join(BUILD, `${name}.webm`))
  fs.rmSync(dir, { recursive: true, force: true })
  save(name, { ...marks, length: t() })
  console.log(`recorded ${name}`, marks)
}

async function hero(page, t, base) {
  await page.goto(base, { waitUntil: 'load' })
  const loaded = t()
  await sleep(4000)
  const scroll = t()
  await page.evaluate(() => document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' }))
  await sleep(5000)
  return { loaded, scroll, end: t() }
}

// Collects build log lines with their time in the video, and stops once the build is live or failed.
async function build(page, t, base) {
  await page.goto(`${base}/sell`, { waitUntil: 'load' })
  const loaded = t()
  await sleep(1200)
  await page.click('#load-example')
  await page.waitForFunction(() => document.querySelector('#code').value.length > 0)
  await sleep(800)
  await page.fill('#name', '')
  await page.type('#name', 'chart', { delay: 90 })
  await page.fill('#price', '0.50')
  await page.fill('#admin', readEnv().VEND_ADMIN_TOKEN)
  await sleep(700)
  const click = t()
  await page.click('#submit')
  // /sell replays the previous build on load; only follow lines once this submission is building.
  await page.waitForFunction(() => document.querySelector('#build-status').textContent === 'building', null, { timeout: 30_000 })
  const lines = []
  const deadline = Date.now() + BUILD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const texts = await page.$$eval('#log .log-line', (els) => els.map((e) => e.lastChild.textContent))
    for (const text of texts.slice(lines.length)) lines.push({ t: t(), text })
    const status = await page.textContent('#build-status')
    if (status === 'live' || status === 'failed') break
    await sleep(200)
  }
  await sleep(3500)
  const status = await page.textContent('#build-status')
  const path_ = lines.map((l) => l.text.match(/live at \S*?(\/t\/[\w-]+)/)?.[1]).find(Boolean)
  return { loaded, click, lines, status, toolUrl: path_ ? base + path_ : null, end: t() }
}

// Runs the real buyer script while /sell is on screen; stdout lines get timestamps on the same clock.
function runBuyer(url, input, t) {
  return new Promise((resolve) => {
    const out = []
    const child = spawn('node', ['scripts/buyer.js', url, JSON.stringify(input)], { cwd: ROOT })
    let buf = ''
    const onData = (chunk) => {
      buf += chunk
      const parts = buf.split('\n')
      buf = parts.pop()
      for (const text of parts) out.push({ t: t(), text: redact(text) })
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      if (buf) out.push({ t: t(), text: redact(buf) })
      resolve({ out, code })
    })
  })
}

// Sell page on screen, buyer runs, wait for `done(text)` on the earnings panel to note the on-screen moment.
async function sellWithBuyer(page, t, base, input, settled) {
  const toolUrl = process.env.TOOL_URL || load('build').toolUrl
  if (!toolUrl) throw new Error('no tool URL in build/build.json; record the build first')
  await page.goto(`${base}/sell`, { waitUntil: 'load' })
  await sleep(2500)
  const start = t()
  const { out, code } = await runBuyer(toolUrl, input, t)
  await page.waitForFunction(settled, null, { timeout: 30_000 }).catch(() => console.warn('panel never settled'))
  const shown = t()
  await sleep(4000)
  const command = `node scripts/buyer.js ${toolUrl} '${JSON.stringify(input)}'`
  return { start, out, code, shown, command, end: t() }
}

// Fallback when the live build was not filmed end to end: /sell replays the last build from its event history,
// and each stage's log lines are highlighted in turn so the narration can point at them.
const STAGES = [['lock', '^network locked'], ['fix', '^test failed|^fixing'], ['live', 'passed|^live|verified']]
async function replay(page, t, base) {
  await page.goto(`${base}/sell`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#build-status').textContent === 'live', null, { timeout: 30_000 })
  await page.addStyleTag({ content: '.log-line.hl { outline: 2px solid #8b8bff; background: rgba(139,139,255,.18); border-radius: 4px; }' })
  const loaded = t()
  await sleep(3000)
  const stages = {}
  for (const [key, re] of STAGES) {
    await page.$$eval('#log .log-line', (els, re) => els.forEach((e) => e.classList.toggle('hl', new RegExp(re).test(e.lastChild.textContent))), re)
    stages[key] = t()
    await sleep(3000)
  }
  return { loaded, stages, end: t() }
}

const buy = (page, t, base) => sellWithBuyer(page, t, base, REVENUE, () => document.querySelector('#calls .badge')?.textContent.includes('✓ paid'))
const evil = (page, t, base) => sellWithBuyer(page, t, base, EVIL, () => /BLOCKED · refunded/.test(document.querySelector('#calls .badge')?.textContent || ''))

// Real command output, captured now and replayed in a terminal page (no screen capture permission needed).
function capture(shown, cmd) {
  const env = { ...process.env, ...readEnv() }
  const out = execFileSync('/bin/zsh', ['-c', cmd], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { command: shown, out: out.split('\n').filter((l) => l.trim() && !/Updating status/.test(l)).map((text) => ({ text: redact(text) })) }
}

const TERMINALS = {
  projects: () => [capture('stripe projects status', 'stripe projects status')],
  stripe: () => {
    const pis = "stripe payment_intents list --limit 3 --api-key \"$STRIPE_SECRET_KEY\" | jq -c '.data[] | {id, amount, currency, status}'"
    const refunds = "stripe refunds list --limit 1 --api-key \"$STRIPE_SECRET_KEY\" | jq -c '.data[] | {id, amount, payment_intent, status}'"
    return [capture(pis, pis), capture(refunds, refunds)]
  },
  buy: () => [load('buy')],
  evil: () => [load('evil')],
}

// Plays a terminal session; returns when each command was typed and when each output line appeared.
async function terminal(page, t, sessions) {
  await page.setContent(terminalHtml(sessions), { waitUntil: 'networkidle' })
  const start = t()
  await page.evaluate(() => window.play())
  await page.waitForFunction(() => window.finished, null, { timeout: 120_000 })
  const marks = await page.evaluate(() => window.marks)
  await sleep(2500)
  return { start, marks: marks.map((m) => ({ ...m, t: start + m.at })), end: t() }
}

const SEGMENTS = {
  hero: (p, t, base) => hero(p, t, base),
  build: (p, t, base) => build(p, t, base),
  buy: (p, t, base) => buy(p, t, base),
  evil: (p, t, base) => evil(p, t, base),
  replay: (p, t, base) => replay(p, t, base),
}

const [base, ...names] = process.argv.slice(2)
if (!base || !names.length) {
  console.error('usage: node scripts/record.js <baseUrl> <hero|build|buy|evil|projects|stripe|term-buy|term-evil>...')
  process.exit(2)
}
fs.mkdirSync(BUILD, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, args: ['--window-size=1920,1080', '--screen-info={1920x1200}'] })
try {
  for (const name of names) {
    if (SEGMENTS[name]) await record(browser, name, (p, t) => SEGMENTS[name](p, t, base.replace(/\/$/, '')))
    else if (TERMINALS[name.replace(/^term-/, '')]) {
      const sessions = TERMINALS[name.replace(/^term-/, '')]()
      await record(browser, name.startsWith('term-') ? name : `term-${name}`, (p, t) => terminal(p, t, sessions))
    } else throw new Error(`unknown segment ${name}`)
  }
} finally {
  await browser.close()
}
