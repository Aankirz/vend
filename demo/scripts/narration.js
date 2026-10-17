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
function buildBeats() {
  if (!fs.existsSync(path.join(BUILD, 'build.json'))) return replayBeats()
  const b = load('build')
  const line = (re) => b.lines.find((l) => re.test(l.text))?.t
  const passed = b.lines.find((l) => /passed/.test(l.text))
  const n = passed?.text.match(/(\d+)\/\d+/)?.[1]
  const anchors = [
    { t: b.loaded + 0.5, say: 'On the seller page, I load an example chart tool, name it, set the price to fifty cents a call, and press Vend it.' },
    { t: b.click + 0.6, caption: 'Building in a CreateOS sandbox', say: "Vend's agent starts a CreateOS sandbox, and writes a server and tests around the code." },
    { t: line(/^network locked/), caption: 'Network locked', say: 'It locks the sandbox network, so nothing inside can reach the internet.' },
    { t: line(/^test failed/), caption: 'Test failed → agent fixes it', say: 'A test fails. The agent reads the error, fixes the wrapper, and runs the tests again.' },
    { t: passed?.t, caption: 'Verified · live', say: `${n ? `All ${n} tests pass` : 'The tests pass'}, and the tool is live as a paid endpoint.` },
  ].filter((a) => a.t !== undefined).sort((x, y) => x.t - y.t)
  return anchors.map((a, i) => ({ src: 'build', from: a.t, to: anchors[i + 1]?.t ?? b.end, caption: a.caption, say: a.say }))
}

function buyBeats() {
  const term = load('term-buy'), sell = load('buy')
  const t402 = at(term.marks, /402 received/), t200 = at(term.marks, /^HTTP 200/)
  return [
    { src: 'term-buy', from: term.start, to: t402 - 0.2, say: 'Now an agent calls the tool, from a plain script.' },
    { src: 'term-buy', from: t402 - 0.2, to: t200 - 0.1, caption: 'HTTP 402 · Payment required', say: 'The first answer is HTTP 402: pay fifty cents. The agent pays with a Stripe shared payment token, and retries.' },
    { src: 'term-buy', from: t200 - 0.1, to: term.end, caption: '200 + receipt', say: 'This time it gets a 200, the chart, and a payment receipt.' },
    { src: 'buy', from: Math.max(sell.shown - 2, 0), to: sell.end, caption: 'Seller keeps 90%', say: 'On the seller page, the earnings tick up. The seller keeps ninety percent.' },
  ]
}

function evilBeats() {
  const term = load('term-evil'), sell = load('evil')
  const tResp = at(term.marks, /^HTTP \d/)
  return [
    { src: 'term-evil', from: term.start, to: tResp - 0.1, say: 'What if a tool tries to phone home? This call points it at an outside host.' },
    { src: 'term-evil', from: tResp - 0.1, to: term.end, caption: 'Call fails', say: 'The sandbox network is locked, so the tool cannot reach it, and the call fails.' },
    { src: 'evil', from: Math.max(sell.shown - 2, 0), to: sell.end, caption: '⛔ BLOCKED · refunded', say: "On the seller page it shows as blocked, and the buyer's fifty cents is refunded automatically. Callers only pay when it works." },
  ]
}

function stripeBeats() {
  const s = load('term-stripe')
  return [{ src: 'term-stripe', from: s.start, to: s.end, caption: 'Stripe test mode', say: 'And it is all real Stripe, in test mode: here are the payment intents, and the refund.' }]
}

export const beats = () => [...heroBeats(), ...projectsBeats(), ...buildBeats(), ...buyBeats(), ...evilBeats(), ...stripeBeats()]
