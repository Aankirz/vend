// A terminal window that replays captured command output, keeping the real pacing (gaps capped).
const MAX_GAP_S = 1.2
const SAME_CHUNK_S = 0.03
const MAX_COLS = 132

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const clip = (s) => (s.length > MAX_COLS ? `${s.slice(0, MAX_COLS - 1)}…` : s)

function kind(text) {
  if (/\b402\b/.test(text)) return 'warn'
  if (/HTTP 200|"ok": true|succeeded/.test(text)) return 'ok'
  if (/blocked|HTTP [45]\d\d|"ok": false/i.test(text)) return 'bad'
  return ''
}

// Seconds after the command is typed at which each output line appears.
function schedule(session) {
  let prev = session.start ?? session.out[0]?.t ?? 0
  let at = 0.4
  return session.out.map((line) => {
    const gap = line.t === undefined ? SAME_CHUNK_S : Math.min(Math.max(line.t - prev, SAME_CHUNK_S), MAX_GAP_S)
    if (line.t !== undefined) prev = line.t
    at += gap
    return { text: clip(line.text), kind: kind(line.text), at }
  })
}

export function terminalHtml(sessions) {
  const plan = sessions.map((s) => ({ command: s.command, lines: schedule(s) }))
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap">
<style>
  :root { --bg: #0d1117; --fg: #d6dde6; --dim: #7d8794; --ok: #4fd18b; --warn: #f2b84b; --bad: #ff6b6b; }
  html, body { margin: 0; height: 100%; background: #e9e4da; }
  body { display: grid; place-items: center; font: 22px/1.5 'JetBrains Mono', ui-monospace, monospace; }
  .win { width: 1760px; height: 960px; background: var(--bg); border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.35); display: flex; flex-direction: column; overflow: hidden; }
  .bar { height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 18px; background: #161b22; color: var(--dim); font-size: 16px; }
  .bar i { width: 13px; height: 13px; border-radius: 50%; background: #ff5f57; } .bar i:nth-child(2) { background: #febc2e; } .bar i:nth-child(3) { background: #28c840; }
  .bar span { margin-left: 14px; }
  .screen { flex: 1; padding: 22px 30px 150px; color: var(--fg); display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; white-space: pre; }
  .prompt { color: var(--ok); } .cmd { color: #fff; white-space: pre-wrap; word-break: break-all; }
  .ok { color: var(--ok); } .warn { color: var(--warn); font-weight: 600; } .bad { color: var(--bad); font-weight: 600; }
  .cursor { display: inline-block; width: .6em; background: var(--fg); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
</style></head><body>
<div class="win"><div class="bar"><i></i><i></i><i></i><span>zsh — ~/Desktop/vend</span></div><div class="screen" id="s"></div></div>
<script>
const plan = ${JSON.stringify(plan).replace(/</g, '\\u003c')}
const s = document.getElementById('s')
const wait = (sec) => new Promise((r) => setTimeout(r, sec * 1000))
const line = (html) => { const d = document.createElement('div'); d.innerHTML = html; s.append(d); return d }
const esc = ${esc.toString()}
window.marks = []
window.play = async () => {
  const t0 = performance.now()
  const now = () => (performance.now() - t0) / 1000
  for (const [i, step] of plan.entries()) {
    const row = line('<span class="prompt">❯ </span><span class="cmd"></span><span class="cursor">&nbsp;</span>')
    const cmd = row.querySelector('.cmd')
    await wait(0.5)
    const perChar = Math.min(0.03, 2.4 / step.command.length)
    for (const ch of step.command) { cmd.textContent += ch; await wait(perChar) }
    await wait(0.35)
    row.querySelector('.cursor').remove()
    window.marks.push({ session: i, typed: true, at: now() })
    const base = performance.now()
    for (const l of step.lines) {
      const delay = l.at - (performance.now() - base) / 1000
      if (delay > 0) await wait(delay)
      line('<span class="' + l.kind + '">' + esc(l.text) + '</span>')
      window.marks.push({ session: i, text: l.text, at: now() })
    }
    await wait(1)
  }
  line('<span class="prompt">❯ </span><span class="cursor">&nbsp;</span>')
  window.finished = true
}
</script></body></html>`
}
