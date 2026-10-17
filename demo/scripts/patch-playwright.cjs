// ponytail: Playwright records at a fixed 1 Mbps VP8, which smears 1080p text. Raise the bitrate in place.
const fs = require('node:fs')
const file = require('node:path').join(__dirname, '../node_modules/playwright-core/lib/server/chromium/videoRecorder.js')
const src = fs.readFileSync(file, 'utf8')
fs.writeFileSync(file, src.replace('-qmax 50 -crf 8', '-qmax 12 -crf 4').replace('-b:v 1M', '-b:v 12M'))
