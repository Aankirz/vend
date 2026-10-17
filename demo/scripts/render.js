// Cuts the recordings to the narration and writes out/vend-demo.mp4 (with owner slots) and out/vend-demo-noslots.mp4.
// usage: node scripts/render.js              full render (voice, captions, clips, final)
//        node scripts/render.js --final-only  reuse rendered clips; just (re)build the slots and the two final files
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { BUILD, DEMO, OUT, ROOT } from './lib.js'
import { beats } from './narration.js'

const VOICE = 'Samantha'
const VOICE_RATE = 170
const LEAD_S = 0.35
const TAIL_S = 0.45
const ZOOM_HOLD_S = 1 // let the zoomed build log sit on screen after each line
const SLOT_S = 15
const END_CARD_S = 4
const MUSIC_VOLUME = 0.05
const MUSIC = path.join(ROOT, 'video/public/track.wav')
const CLIPS = path.join(BUILD, 'clips')
const LIVE_URL = 'production-vend-gateway.tyzo.nodeops.app'
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' })
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }))
const hasAudio = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim() !== ''
const clip = (name) => path.join(CLIPS, `${name}.mp4`)

function speak(text, name) {
  const aiff = path.join(CLIPS, `${name}.aiff`), wav = path.join(CLIPS, `${name}.wav`)
  execFileSync('say', ['-v', VOICE, '-r', String(VOICE_RATE), '-o', aiff, text])
  ff(['-i', aiff, '-ar', '48000', '-ac', '2', wav])
  return wav
}

const CARD_CSS = `html,body{margin:0;width:1920px;height:1080px;font-family:'Space Grotesk','Inter',sans-serif}
.cap{position:absolute;right:96px;top:84px;display:flex;align-items:center;gap:18px;padding:20px 30px 20px 24px;background:rgba(13,17,23,.92);color:#fff;border-radius:12px;font-size:40px;font-weight:600;box-shadow:0 18px 50px rgba(0,0,0,.35)}
.cap i{width:8px;height:44px;border-radius:4px;background:#5b5bf0}
.card{width:100%;height:100%;display:grid;place-content:center;text-align:center;background:#f4f1ea;color:#14161a}
.card h1{font-size:96px;margin:0 0 18px}.card p{font:28px/1.4 'JetBrains Mono',monospace;color:#5b5f66;margin:0}`
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&family=JetBrains+Mono&display=swap">'
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

async function still(browser, html, file, transparent) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.setContent(`<!doctype html><meta charset="utf-8">${FONTS}<style>${CARD_CSS}${transparent ? 'body{background:transparent}' : ''}</style>${html}`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: file, omitBackground: transparent })
  await page.close()
  return file
}

// A 16:9 window around the build log, so its lines fill the frame.
function zoomCrop(box) {
  const w = Math.round(Math.min(1920, Math.max(box.w + 360, 900)) / 2) * 2
  const h = Math.round((w * 9) / 16 / 2) * 2
  const x = Math.round(Math.min(Math.max(box.x + box.w / 2 - w / 2, 0), 1920 - w))
  const y = Math.round(Math.min(Math.max(box.y - 24, 0), 1080 - h))
  return `crop=${w}:${h}:${x}:${y},scale=1920:1080:flags=lanczos,`
}

// One beat → one clip: the source stretch is retimed to exactly the length of its line.
function renderBeat(beat, i, wav, caption) {
  const length = LEAD_S + duration(wav) + TAIL_S + (beat.zoom && beat.src === 'build' ? ZOOM_HOLD_S : 0)
  const factor = length / Math.max(beat.to - beat.from, 0.1)
  const inputs = ['-ss', beat.from.toFixed(3), '-to', beat.to.toFixed(3), '-i', path.join(BUILD, `${beat.src}.webm`), '-i', wav]
  let graph = `[0:v]setpts=(PTS-STARTPTS)*${factor.toFixed(4)},tpad=stop_mode=clone:stop_duration=2,fps=30,scale=1920:1080,${beat.zoom ? zoomCrop(beat.zoom) : ''}setsar=1[v0];`
  if (caption) {
    inputs.push('-loop', '1', '-t', length.toFixed(3), '-i', caption)
    graph += `[2:v]format=rgba,fade=in:st=0.2:d=0.3:alpha=1[c];[v0][c]overlay=0:0[v1];`
  } else graph += '[v0]null[v1];'
  const lead = Math.round(LEAD_S * 1000)
  graph += `[v1]format=yuv420p[v];[1:a]adelay=${lead}|${lead},apad[a]`
  ff([...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', length.toFixed(3), ...ENC, clip(`beat-${String(i).padStart(2, '0')}`)])
  return length
}

function stillClip(png, seconds, name) {
  ff(['-loop', '1', '-t', String(seconds), '-i', png, '-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo', '-vf', 'fps=30,format=yuv420p', '-shortest', ...ENC, clip(name)])
}

// The owner's own clip if it is in demo/owner/, else a title card holding its place.
function slotClip(slot, card) {
  const own = ['mov', 'mp4', 'm4v'].map((ext) => path.join(DEMO, 'owner', `${slot}.${ext}`)).find((f) => fs.existsSync(f))
  if (!own) return stillClip(card, SLOT_S, slot)
  const vf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p'
  const audio = hasAudio(own) ? ['-map', '0:a:0'] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '1:a', '-shortest']
  ff(['-i', own, ...audio.slice(0, audio.indexOf('-map')), '-map', '0:v:0', ...audio.slice(audio.indexOf('-map')), '-vf', vf, ...ENC, clip(slot)])
  console.log(`slot ${slot}: using ${path.relative(DEMO, own)}`)
}

function concat(names, out) {
  const list = path.join(CLIPS, `${path.basename(out)}.txt`)
  fs.writeFileSync(list, names.map((n) => `file '${clip(n)}'`).join('\n'))
  const joined = path.join(CLIPS, `joined-${path.basename(out)}`)
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined])
  if (!fs.existsSync(MUSIC)) return fs.renameSync(joined, out)
  // Trim to the video stream so no audio-only tail renders as black frames.
  const videoLength = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=duration', '-of', 'csv=p=0', joined], { encoding: 'utf8' }).trim()
  ff(['-i', joined, '-t', videoLength, '-stream_loop', '-1', '-i', MUSIC, '-filter_complex', `[1:a]volume=${MUSIC_VOLUME},aresample=48000[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out])
  fs.rmSync(joined)
  console.log(`${path.relative(DEMO, out)}: ${duration(out).toFixed(1)} s, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`)
}

const finalOnly = process.argv.includes('--final-only')
fs.mkdirSync(OUT, { recursive: true })
if (!finalOnly) fs.rmSync(CLIPS, { recursive: true, force: true })
fs.mkdirSync(CLIPS, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const card = (title, sub, name) => still(browser, `<div class="card"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>`, path.join(CLIPS, `${name}.png`), false)
  const beatNames = []
  if (finalOnly) beatNames.push(...fs.readdirSync(CLIPS).filter((f) => /^beat-\d+\.mp4$/.test(f)).sort().map((f) => f.replace('.mp4', '')))
  else {
    let total = 0
    for (const [i, beat] of beats().entries()) {
      const wav = speak(beat.say, `beat-${String(i).padStart(2, '0')}`)
      const caption = beat.caption && (await still(browser, `<div class="cap"><i></i>${esc(beat.caption)}</div>`, path.join(CLIPS, `cap-${i}.png`), true))
      total += renderBeat(beat, i, wav, caption)
      beatNames.push(`beat-${String(i).padStart(2, '0')}`)
      console.log(`beat ${i} (${beat.src}) done, ${total.toFixed(1)} s so far`)
    }
    stillClip(await card('Vend', `${LIVE_URL}  ·  github.com/Aankirz/vend`, 'end-card'), END_CARD_S, 'end')
  }
  slotClip('intro', await card('[Owner intro]', 'drop demo/owner/intro.mov, then: npm --prefix demo run final', 'intro-card'))
  slotClip('outro', await card('[Owner outro]', 'drop demo/owner/outro.mov, then: npm --prefix demo run final', 'outro-card'))
  concat(['intro', ...beatNames, 'end', 'outro'], path.join(OUT, 'vend-demo.mp4'))
  concat([...beatNames, 'end'], path.join(OUT, 'vend-demo-noslots.mp4'))
} finally {
  await browser.close()
}
