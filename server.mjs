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
    if (request.url === '/health') return json(response, 200, { ok: true, bot: Boolean(token), web_app: Boolean(publicUrl) })
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
