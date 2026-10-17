// Synthesizes the Vend launch track: 120 BPM, 40 s, plain PCM math + macOS `say` chops.
// Output: public/track.wav (44.1 kHz, 16-bit stereo). No samples, no services.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(ROOT, 'public', 'track.wav')

export const BPM = 120
const SR = 44100
const BEAT = 60 / BPM // 0.5 s
const BAR = BEAT * 4 // 2 s
const BARS = 20
const LENGTH = BAR * BARS // 40 s
const N = Math.round(LENGTH * SR)

const left = new Float32Array(N)
const right = new Float32Array(N)
// Vocals get their own bus so the beat can duck under the chant.
const voxL = new Float32Array(N)
const voxR = new Float32Array(N)
let bus = [left, right]
const duck = new Float32Array(N).fill(1) // sidechain envelope written by the kick

// ponytail: tiny deterministic PRNG so the noise (and the render) is identical every run.
let seed = 7
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1

const at = (bar, beat = 0) => (bar * BAR + beat * BEAT)
const mtof = (m) => 440 * 2 ** ((m - 69) / 12)

function add(t0, dur, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR)
  const len = Math.round(dur * SR)
  const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan)
  for (let i = 0; i < len && s0 + i < N; i++) {
    const v = fn(i / SR)
    bus[0][s0 + i] += v * gl
    bus[1][s0 + i] += v * gr
  }
}

/* ───────── drums ───────── */
function kick(t0, gain = 0.9) {
  let phase = 0
  add(t0, 0.4, (t) => {
    phase += (2 * Math.PI * (45 + 120 * Math.exp(-t * 28))) / SR
    return Math.sin(phase) * Math.exp(-t * 7) + (t < 0.004 ? noise() * 0.4 : 0)
  }, gain)
  const s0 = Math.round(t0 * SR)
  for (let i = 0; i < 0.3 * SR && s0 + i < N; i++) duck[s0 + i] = Math.min(duck[s0 + i], 0.35 + 0.65 * Math.min(1, i / (0.3 * SR)) ** 2)
}

function clap(t0, gain = 0.16) {
  let prev = 0
  add(t0, 0.25, (t) => {
    const n = noise()
    const hp = n - prev // crude high-pass: claps live up top
    prev = n
    const burst = [0, 0.01, 0.02].some((o) => t >= o && t < o + 0.008) ? 1.6 : 1
    return hp * burst * Math.exp(-t * 32)
  }, gain)
}

function hat(t0, gain = 0.12, pan = 0.3) {
  let prev = 0
  add(t0, 0.05, (t) => {
    const n = noise()
    const hp = n - prev
    prev = n
    return hp * Math.exp(-t * 90)
  }, gain, pan)
}

/* ───────── tonal ───────── */
const saw = (f, t) => {
  let v = 0
  for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * t) / k
  return v * 0.6
}

function bassNote(t0, midi, dur, gain = 0.42) {
  const f = mtof(midi)
  add(t0, dur, (t) => saw(f, t) * Math.min(1, t * 200) * Math.exp(-t * 3.5), gain)
}

function pluck(t0, midi, dur, gain = 0.16, pan = 0) {
  const f = mtof(midi)
  add(t0, dur, (t) => {
    const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.3
    return sq * Math.min(1, t * 400) * Math.exp(-t * 9)
  }, gain, pan)
}

function riser(t0, dur, gain = 0.18) {
  let prev = 0
  add(t0, dur, (t) => {
    const n = noise()
    const hp = n - prev * (1 - t / dur) // opens up as it climbs
    prev = n
    return hp * (t / dur) ** 2
  }, gain)
}

function impact(t0, gain = 0.8) {
  let phase = 0
  add(t0, 1.6, (t) => {
    phase += (2 * Math.PI * (30 + 80 * Math.exp(-t * 10))) / SR
    return Math.sin(phase) * Math.exp(-t * 2.2) + noise() * 0.25 * Math.exp(-t * 6)
  }, gain)
}

// Am – F – C – G, one chord per bar. [bass root, arp tones]
const CHORDS = [
  [45, [69, 72, 76, 81]],
  [41, [65, 69, 72, 77]],
  [48, [67, 72, 76, 79]],
  [43, [67, 71, 74, 79]],
]
// The hook riff: 16 sixteenths over the chord tones (indexes into the arp array).
const RIFF = [0, 2, 1, 3, 2, 1, 0, 2, 3, 2, 1, 2, 0, 1, 3, 2]

function bar(b, { drums = true, bass = true, arp = true, clapOn = true, hats = true } = {}) {
  const [root, tones] = CHORDS[b % 4]
  for (let beat = 0; beat < 4; beat++) {
    if (drums) kick(at(b, beat))
    if (drums && clapOn && beat % 2 === 1) clap(at(b, beat))
    if (hats) hat(at(b, beat + 0.5))
    if (bass) {
      bassNote(at(b, beat + 0.5), root, BEAT * 0.45)
      bassNote(at(b, beat + 0.75), root + 12, BEAT * 0.2, 0.25)
    }
  }
  if (arp) RIFF.forEach((i, s) => pluck(at(b, s / 4), tones[i], BEAT * 0.4, 0.15, s % 2 ? 0.35 : -0.35))
}

/* ───────── vocals (macOS say → ffmpeg → PCM) ───────── */
function voice(text, voiceName, pitch = 1, rate = 190) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vend-say-'))
  const aiff = path.join(dir, 'v.aiff')
  const raw = path.join(dir, 'v.raw')
  execFileSync('say', ['-v', voiceName, '-r', String(rate), '-o', aiff, text])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-af', `asetrate=22050*${pitch},aresample=${SR},highpass=f=120,acompressor=threshold=0.1:ratio=6`, '-ac', '1', '-f', 'f32le', raw])
  const buf = fs.readFileSync(raw)
  fs.rmSync(dir, { recursive: true, force: true })
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
}

function placeVocal(t0, pcm, gain = 0.9, pan = 0) {
  bus = [voxL, voxR]
  add(t0, pcm.length / SR, (t) => pcm[Math.floor(t * SR)] || 0, gain, pan)
  bus = [left, right]
}

// Two voices a hair apart = a chant, not a text-to-speech read-out.
function chant(t0, text, opts = {}) {
  const { pitch = 1, gain = 1.5 } = opts
  placeVocal(t0, voice(text, 'Samantha', pitch, 200), gain, -0.15)
  placeVocal(t0 + 0.012, voice(text, 'Daniel', pitch * 0.94, 200), gain * 0.7, 0.15)
}

/* ───────── arrangement (bar = 2 s) ───────── */
export const CUES = {
  logo: 0, title: 1, build: 2, buyer: 6, slam402: 7, breakdown: 9, blocked: 10, outro: 13, end: 20,
}

function arrange() {
  bar(0, { drums: false, bass: false, hats: false })
  riser(at(0, 2), BEAT * 2)
  bar(1, { clapOn: false, bass: false })
  for (let b = 2; b < 9; b++) bar(b)
  bar(9, { drums: false, bass: false, arp: true, hats: false }) // breakdown before the drop
  riser(at(9), BAR, 0.3)
  impact(at(10)) // ⛔ BLOCKED lands here
  for (let b = 10; b < 13; b++) bar(b, { arp: b !== 10 })
  for (let b = 13; b < 19; b++) bar(b)
  bar(19, { drums: false, bass: false, hats: false })
  impact(at(19), 0.5)

  const hook = (b) => chant(at(b), 'Vend it.', { pitch: 1.04 })
  ;[2, 4, 13, 15, 17].forEach(hook)
  chant(at(7), 'Four oh two!', { pitch: 1.08 })
  chant(at(8), 'Pay per call.', { pitch: 1.04 })
  chant(at(14), 'Pay per call.', { pitch: 1.04 })
  chant(at(16), 'Pay per call.', { pitch: 1.04 })
  chant(at(18), 'Vend it.', { pitch: 1.0, gain: 1 })
}

const VOX_DUCK = 0.6 // how far the beat dips while the chant sings
function mixdown() {
  let env = 0
  for (let i = 0; i < N; i++) {
    const level = Math.abs(voxL[i]) + Math.abs(voxR[i])
    env = level > env ? env + (level - env) * 0.01 : env * 0.9997 // fast attack, slow release
    const dip = 1 - VOX_DUCK * Math.min(1, env * 3)
    const fadeOut = Math.min(1, (N - i) / (SR * 1.5))
    left[i] = Math.tanh((left[i] * dip + voxL[i]) * 0.9) * fadeOut
    right[i] = Math.tanh((right[i] * dip + voxR[i]) * 0.9) * fadeOut
  }
}

function writeWav(file) {
  const data = Buffer.alloc(N * 4)
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), i * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.concat([h, data]))
}

// Sidechain only the tonal layers would need separate buses; ducking the whole mix is the cheap version.
function applyDuck() {
  for (let i = 0; i < N; i++) {
    const d = 0.55 + 0.45 * duck[i]
    left[i] *= d
    right[i] *= d
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  arrange()
  applyDuck()
  mixdown()
  writeWav(OUT)
  console.log(`wrote ${path.relative(ROOT, OUT)} · ${LENGTH}s @ ${BPM} BPM`)
}
