// Captures the live Vend site (light, 1920x1080) into public/capture/ for the video.
// waitUntil 'load', not 'networkidle': the page holds an SSE stream open forever.
// Uses the Playwright install on this machine; set PLAYWRIGHT_DIR if yours lives elsewhere.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(ROOT, 'public', 'capture')
const SITE = process.env.VEND_URL || 'https://production-vend-gateway.tyzo.nodeops.app'
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR || '/opt/homebrew/lib/node_modules/')('playwright')
const VIEW = { width: 1920, height: 1080 }

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

async function stills() {
  const page = await browser.newPage({ viewport: VIEW, colorScheme: 'light', deviceScaleFactor: 1 })
  await page.goto(SITE + '/', { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'home.png') })
  await page.locator('#how-heading').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -80))
  await page.waitForTimeout(2500) // the figures draw themselves in on scroll
  await page.screenshot({ path: path.join(OUT, 'stages.png') })
  await page.locator('#tools').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, 'tools.png') })
  await page.goto(SITE + '/sell', { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  // sell.png is the page as it is now. The ledger shots use sell-ledger.png, a capture of the
  // same live page taken while it held real paid + BLOCKED rows; it is never overwritten here.
  await page.screenshot({ path: path.join(OUT, 'sell.png') })
  await page.close()
}

async function scrollClip() {
  const ctx = await browser.newContext({ viewport: VIEW, colorScheme: 'light', recordVideo: { dir: OUT, size: VIEW } })
  const page = await ctx.newPage()
  await page.goto(SITE + '/', { waitUntil: 'load' })
  await page.waitForTimeout(3000) // hold on the isometric hero before scrolling
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 28)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(600)
  const video = page.video()
  await ctx.close()
  fs.renameSync(await video.path(), path.join(OUT, 'home-scroll.webm'))
}

await stills()
await scrollClip()
await browser.close()
console.log('captured', fs.readdirSync(OUT).join(', '))
