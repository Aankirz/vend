// The edit decision list: every beat is a stretch of a recording, the line said over it, and an optional caption.
// Beats are cut on marks captured while recording, so the words land on what is on screen.
import fs from 'node:fs'
import path from 'node:path'
import { BUILD } from './lib.js'

const load = (name) => JSON.parse(fs.readFileSync(path.join(BUILD, `${name}.json`), 'utf8'))
const at = (marks, re) => marks.find((m) => m.text !== undefined && re.test(m.text))?.t

function heroBeats() {
  const h = load('hero')
  return [
    { src: 'hero', from: h.loaded + 0.3, to: h.scroll, say: 'This is Vend. Paste in a Python tool, and any AI agent can pay for it per call, over plain HTTP, with Stripe.' },
    { src: 'hero', from: h.scroll, to: h.end, say: 'Sellers keep ninety percent, and calls that fail are refunded.' },
  ]
}

function projectsBeats() {
  const p = load('term-projects')
  return [{ src: 'term-projects', from: p.start, to: p.end, caption: 'Set up with Stripe Projects', say: 'The whole stack was set up with Stripe Projects: CreateOS for sandboxes and hosting, with the keys pulled straight into the env file.' }]
}

// Fallback edit: the filmed click-through up to the first build lines, then /sell's replay of that same build.
function replayBeats() {
  const s = load('build-start'), r = load('replay')
  return [
    { src: 'build-start', from: s.loaded + 0.5, to: s.click + 0.6, say: 'On the seller page, I load an example chart tool, name it, set the price to fifty cents a call, and press Vend it.' },
    { src: 'build-start', from: s.click + 0.6, to: s.length, caption: 'Building in a CreateOS sandbox', say: "Vend's agent starts a CreateOS sandbox, and writes a server and tests around the code." },
    { src: 'replay', from: r.loaded, to: r.stages.lock, say: 'Here is the log of that build, start to finish.' },
    { src: 'replay', from: r.stages.lock, to: r.stages.fix, caption: 'Network locked', say: 'It locks the sandbox network, so nothing inside can reach the internet.' },
    { src: 'replay', from: r.stages.fix, to: r.stages.live, caption: 'Test failed → agent fixes it', say: 'A test fails. The agent reads the error, fixes the wrapper, and runs the tests again.' },
    { src: 'replay', from: r.stages.live, to: r.end, caption: 'Verified · live', say: 'All five tests pass, and the tool is live as a paid endpoint.' },
  ]
}

// Anchors in the order they happened; each beat runs from its anchor to the next one.
// The fail → fix → pass stretch is zoomed onto the build log and given room to breathe.
function buildBeats() {
  if (!fs.existsSync(path.join(BUILD, 'build.json'))) return replayBeats()
  const b = load('build')
  if (b.status !== 'live') return replayBeats()
  const line = (re, after = 0) => b.lines.find((l) => l.t >= after && re.test(l.text))?.t
  const fail = line(/^test failed/)
  const rerun = fail && line(/^running \d+ tests/, fail + 0.01)
  const passed = b.lines.find((l) => /passed/.test(l.text))
  const bytes = b.lines.some((l) => /^test failed/.test(l.text) && /b'|bytes/.test(l.text))
  const n = passed?.text.match(/(\d+)\/\d+/)?.[1] || 'All'
  const anchors = [
    { t: b.loaded + 0.5, say: 'On the seller page, I load an example chart tool, name it, set the price to fifty cents a call, and press Vend it.' },
    { t: b.click + 0.6, caption: 'Building in a CreateOS sandbox', say: "Vend's agent starts a CreateOS sandbox, and writes a server and tests around the code." },
    { t: line(/^network locked/), caption: 'Network locked', say: 'It locks the sandbox network, so nothing inside can reach the internet.' },
    { t: fail, zoom: true, caption: 'Test failed', say: `Then a test fails${bytes ? ': the tool returns bytes, not text' : ''}. The agent wrote these tests itself, and one of them just caught the bug.` },
    { t: fail && (fail + (rerun ?? passed.t)) / 2, zoom: true, caption: 'Agent fixes its own code', say: 'It reads the error, rewrites its own wrapper, and runs every test again.' },
    { t: passed?.t, zoom: true, caption: `${n}/${n} passed`, say: `${n} of ${n} pass.` },
    { t: line(/^live ✅|verified/), caption: 'Live', say: 'And the tool is live, as a paid endpoint.' },
  ].filter((a) => a.t !== undefined).sort((x, y) => x.t - y.t)
  return anchors.map((a, i) => ({ src: 'build', from: a.t, to: anchors[i + 1]?.t ?? b.end, zoom: a.zoom && b.logBox, caption: a.caption, say: a.say }))
}

// The site's own Try buttons, with /sell filmed alongside on the same clock.
// ponytail: fixed window over the hero's buttons + result panel at 1920x1080; re-measure if the hero layout moves.
const TRY_ZOOM = { x: 480, y: 440, w: 740, h: 595 }
function tryBeats() {
  const r = load('try')
  const step = (run, re) => run.steps.find((s) => re.test(s.text))?.t
  const t402 = step(r.paid, /^402/) ?? r.paid.click + 2
  const tOk = step(r.paid, /^ok/) ?? r.paid.shown
  const tBlocked = step(r.evil, /^(blocked|failed)/) ?? r.evil.shown
  const beats = [
    { src: 'try', from: r.paid.click - 1.2, to: t402, say: 'Now an agent buys a call, right from the home page.' },
    { src: 'try', from: t402, to: tOk, caption: 'HTTP 402 · pay $0.50', say: 'The first answer is HTTP 402: payment required, fifty cents. The agent pays with a Stripe shared payment token, and retries.' },
    { src: 'try', from: tOk, to: r.paid.shown + 2.5, caption: '200 · chart delivered', say: 'It gets a 200, and the chart.' },
    { src: 'try-sell', from: tOk - 1, to: tOk + 4, caption: 'Seller keeps 90%', say: 'On the seller page, the earnings tick up. The seller keeps ninety percent.' },
    { src: 'try', from: r.evil.click - 1, to: tBlocked, say: 'What if a tool tries to phone home? This call points it at an outside host.' },
    { src: 'try', from: tBlocked, to: r.evil.shown + 3, caption: '⛔ BLOCKED · refunded', say: 'The sandbox network is locked, so the call is blocked, and the buyer is refunded automatically.' },
    { src: 'try-sell', from: tBlocked - 0.5, to: r.end, caption: 'Callers only pay when it works', say: "The seller's ledger shows it too. Callers only pay when it works." },
  ]
  // Takes before the recorder fix started the clock after both contexts spun up: 2.1 s measured off the BLOCKED banner.
  const offset = r.videoOffset ?? 2.1
  return beats.map((b) => ({ ...b, from: b.from + offset, to: b.to + offset, ...(b.src === 'try' && { zoom: TRY_ZOOM }) }))
}

function stripeBeats() {
  const s = load('term-stripe')
  return [{ src: 'term-stripe', from: s.start, to: s.end, caption: 'Stripe test mode', say: 'And it is all real Stripe, in test mode: here are the payment intents, and the refund.' }]
}

export const beats = () => [...heroBeats(), ...projectsBeats(), ...buildBeats(), ...tryBeats(), ...stripeBeats()]
