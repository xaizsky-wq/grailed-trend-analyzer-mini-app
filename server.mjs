import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT || 8080)
const token = process.env.BOT_TOKEN || ''
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const publicUrl = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/$/, '')
const dist = join(process.cwd(), 'dist')

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm',
}

async function telegram(method, body) {
  if (!token) throw new Error('BOT_TOKEN is missing')
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!result.ok) throw new Error(`${method}: ${result.description || response.status}`)
  return result.result
}

function launchKeyboard() {
  return { inline_keyboard: [[{ text: 'Открыть Grailed Analyzer', web_app: { url: publicUrl } }]] }
}

async function handleUpdate(update) {
  const message = update?.message
  if (!message?.chat?.id || !publicUrl) return
  await telegram('sendMessage', {
    chat_id: message.chat.id,
    text: 'Grailed Trend Analyzer готов. Нажмите кнопку ниже, чтобы открыть Mini App.',
    reply_markup: launchKeyboard(),
  })
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  return table
})()

function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
function u16(value) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(value); return b }
function u32(value) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(value >>> 0); return b }
function createZip(files) {
  const local = [], central = []; let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name), size = file.bytes.length, crc = crc32(file.bytes)
    const entry = Buffer.concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0),name,file.bytes])
    local.push(entry)
    central.push(Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]))
    offset += entry.length
  }
  const localData = Buffer.concat(local), centralData = Buffer.concat(central)
  return Buffer.concat([localData, centralData, u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralData.length),u32(localData.length),u16(0)])
}

async function fetchWithTimeout(url, timeout = 20_000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout)
  try { return await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 GrailedMiniApp/1.0' } }) }
  finally { clearTimeout(timer) }
}

async function galleryZip(request, response, id) {
  if (!/^\d+$/.test(id)) return json(response, 400, { ok: false, error: 'Invalid listing id' })
  const source = await fetchWithTimeout(`https://r.jina.ai/http://www.grailed.com/api/listings/${id}`)
  if (!source.ok) throw new Error(`Gallery metadata failed: ${source.status}`)
  const text = await source.text(), marker = 'Markdown Content:'
  const payload = JSON.parse(text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text.trim())
  const urls = (payload?.data?.photos || []).map(photo => photo?.url).filter(Boolean).slice(0, 30)
  if (!urls.length) return json(response, 404, { ok: false, error: 'No photos found' })
  const files = []
  for (let start = 0; start < urls.length; start += 4) {
    const batch = await Promise.all(urls.slice(start, start + 4).map(async (url, batchIndex) => {
      const image = await fetchWithTimeout(url, 30_000)
      if (!image.ok) throw new Error(`Photo download failed: ${image.status}`)
      const type = image.headers.get('content-type') || ''
      return { name: `${String(start + batchIndex + 1).padStart(2, '0')}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`, bytes: Buffer.from(await image.arrayBuffer()) }
    }))
    files.push(...batch)
  }
  const archive = createZip(files)
  response.writeHead(200, {
    'content-type': 'application/zip',
    'content-length': archive.length,
    'content-disposition': `attachment; filename="grailed-${id}-photos.zip"`,
    'cache-control': 'private, max-age=300',
  })
  response.end(archive)
}

async function serveStatic(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const requested = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
  let file = join(dist, requested === '/' ? 'index.html' : requested)
  if (!file.startsWith(dist)) return json(response, 403, { ok: false })
  try { if (!(await stat(file)).isFile()) file = join(dist, 'index.html') } catch { file = join(dist, 'index.html') }
  if (!existsSync(file)) return json(response, 503, { ok: false, error: 'Build output is missing' })
  response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
  createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    if (request.url === '/health') return json(response, 200, { ok: true, bot: Boolean(token), web_app: Boolean(publicUrl) })
    const galleryMatch = url.pathname.match(/^\/api\/listings\/(\d+)\/gallery\.zip$/)
    if (galleryMatch && request.method === 'GET') return await galleryZip(request, response, galleryMatch[1])
    if (request.url === '/api/telegram/webhook' && request.method === 'POST') {
      if (webhookSecret && request.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) return json(response, 401, { ok: false })
      let raw = ''
      for await (const chunk of request) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request too large') }
      const update = JSON.parse(raw || '{}')
      json(response, 200, { ok: true })
      void handleUpdate(update).catch(error => console.error('Telegram update failed:', error.message))
      return
    }
    await serveStatic(request, response)
  } catch (error) { console.error(error); if (!response.headersSent) json(response, 500, { ok: false }) }
})

server.listen(port, '0.0.0.0', async () => {
  console.log(`Server listening on ${port}`)
  if (!token || !publicUrl) return console.log('Telegram setup skipped: BOT_TOKEN or PUBLIC_URL is missing')
  try {
    const bot = await telegram('getMe', {})
    await telegram('setWebhook', { url: `${publicUrl}/api/telegram/webhook`, secret_token: webhookSecret || undefined, allowed_updates: ['message'], drop_pending_updates: true })
    await telegram('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть приложение', web_app: { url: publicUrl } } })
    await telegram('setMyCommands', { commands: [{ command: 'start', description: 'Открыть Mini App' }] })
    console.log(`Telegram bot @${bot.username} connected`)
  } catch (error) { console.error('Telegram setup failed:', error.message) }
})
