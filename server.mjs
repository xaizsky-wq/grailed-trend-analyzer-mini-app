import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { createGzip } from 'node:zlib'

const port = Number(process.env.PORT || 8080)
const token = process.env.BOT_TOKEN || ''
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const publicUrl = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/$/, '')
const dist = join(process.cwd(), 'dist')
const receiptAssets = join(process.cwd(), 'receipt-assets')
const APP_ID = 'MNRWEFSS2Q'
const SEARCH_KEY = 'c89dbaddf15fe70e1941a109bf7c2a3d'
const PATHS = {
  sneakers: ['footwear.hitop_sneakers', 'footwear.lowtop_sneakers'], down_jackets: ['outerwear.parkas', 'outerwear.heavy_coats', 'outerwear.light_jackets'],
  tshirts: ['tops.short_sleeve_shirts', 'tops.long_sleeve_shirts'], bags: ['accessories.bags_luggage'], hoodies: ['tops.sweatshirts_hoodies'], sweatshirts: ['tops.sweatshirts_hoodies'],
  pants: ['bottoms.casual_pants', 'bottoms.sweatpants_joggers', 'bottoms.cropped_pants'], jeans: ['bottoms.denim'], hats: ['accessories.hats'], watches: ['accessories.jewelry_watches'], jewelry: ['accessories.jewelry_watches'],
}
const QUERIES = { down_jackets: 'puffer', sweatshirts: 'sweatshirt' }
const trendsCache = new Map()

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

async function serveReceipt(response, id, inline) {
  if (!/^(a4|thermal|email)-\d+$/.test(id)) return json(response, 400, { ok: false, error: 'Invalid receipt id' })
  const candidates = [`${id}.ai`, `${id}.html`]
  const name = candidates.find(candidate => existsSync(join(receiptAssets, candidate)))
  if (!name) return json(response, 404, { ok: false, error: 'Receipt not found' })
  const file = join(receiptAssets, name)
  const info = await stat(file)
  const isHtml = name.endsWith('.html')
  response.writeHead(200, {
    'content-type': isHtml ? 'text/html; charset=utf-8' : 'application/pdf',
    'content-length': info.size,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    ...(isHtml ? { 'content-security-policy': "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; base-uri 'none'; form-action 'none'" } : {}),
  })
  createReadStream(file).pipe(response)
}

function previewUrl(value, width) {
  if (!value) return null
  try { const url = new URL(String(value)); url.searchParams.set('w', String(width)); return url.toString() } catch { return String(value) }
}

function trendWindow(type, season, date) {
  const end = new Date(), start = new Date(end)
  const days = { days_7: 7, days_30: 30, days_90: 90 }
  if (type === 'current') start.setHours(0, 0, 0, 0)
  else if (days[type]) start.setDate(start.getDate() - days[type])
  else if (type === 'custom_date' && date) {
    const [year, month, day] = date.split('-').map(Number)
    start.setTime(new Date(year, month - 1, day, 0, 0, 0, 0).getTime())
    end.setTime(new Date(year, month - 1, day, 23, 59, 59, 999).getTime())
  } else if (type === 'season') {
    const month = { spring: 2, summer: 5, autumn: 8, winter: 11 }[season || 'winter']
    let year = end.getFullYear(), candidate = new Date(year, month, 1)
    if (candidate > end) candidate = new Date(--year, month, 1)
    start.setTime(candidate.getTime())
    const seasonEnd = new Date(year, month + 3, 0, 23, 59, 59, 999)
    if (seasonEnd < end) end.setTime(seasonEnd.getTime())
  }
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)]
}

function categoryHitMatches(category, hit) {
  const text = `${hit.title || ''} ${Array.isArray(hit.designer_names) ? hit.designer_names.join(' ') : hit.designer_names || ''}`.toLowerCase()
  if (category === 'down_jackets') return /\b(puffer|down|nuptse|maya|expedition|parka)\b/.test(text)
  if (category === 'hoodies') return /\b(hoodie|hooded|zip[- ]?up)\b/.test(text)
  if (category === 'sweatshirts') return /\b(sweatshirt|crewneck|sweater)\b/.test(text)
  if (category === 'watches') return /\b(watch|rolex|submariner|datejust|santos|g[- ]?shock|casio|seiko|omega)\b/.test(text)
  if (category === 'jewelry') return /\b(jewelry|necklace|bracelet|ring|pendant|chain|earring|bangle|brooch)\b/.test(text)
  return true
}

function keyFor(brand, title) {
  const blob = `${brand} ${title}`.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')
  const patterns = [
    [/\b(?:air jordan|jordan)\s*(\d+)\b/, m => `jordan|jordan ${m[1]}`], [/\bdunk\s+(low|high)\b/, m => `nike|dunk ${m[1]}`],
    [/\b(?:air force\s*1|af1|air force)\b/, () => 'nike|air force 1'], [/\bair max\s*(\d+)\b/, m => `nike|air max ${m[1]}`],
    [/\byeezy\s+(\d+|slide|foam)\b/, m => `yeezy|yeezy ${m[1]}`], [/\bgats?\b/, () => 'maison margiela|gat'],
    [/\bnuptse\b/, () => 'the north face|nuptse'], [/\bbox logo\b/, () => 'supreme|box logo'],
    [/\bspeedy\s*(\d+)?\b/, m => `louis vuitton|speedy ${m[1] || ''}`.trim()], [/\bneverfull\b/, () => 'louis vuitton|neverfull'],
  ]
  for (const [regex, make] of patterns) { const match = blob.match(regex); if (match) return make(match) }
  const brandKey = (brand || 'other').split('×')[0].trim().toLowerCase()
  const stop = new Set(['the','and','for','with','new','mens','men','shirt','tee','shoes','sneakers','jacket','bag','size','vintage'])
  const words = title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(word => word.length > 1 && !stop.has(word) && !/^\d{2,4}$/.test(word))
  return `${brandKey}|${words.slice(0, 2).join(' ')}`
}

function pretty(key, brand) {
  const slug = key.split('|')[1] || key
  return `${brand.split('×')[0].trim()} ${slug.split(' ').map(value => ['gat','sb'].includes(value) ? value.toUpperCase() : (value[0]?.toUpperCase() || '') + value.slice(1)).join(' ')}`.trim()
}

async function trendQuery(category, page, start, end, min, max) {
  const numericFilters = [`sold_at_i>=${start}`, `sold_at_i<=${end}`]
  if (min != null) numericFilters.push(`price>=${min}`)
  if (max != null) numericFilters.push(`price<=${max}`)
  const params = new URLSearchParams({ query: QUERIES[category] || '', hitsPerPage: '100', page: String(page), facetFilters: JSON.stringify([PATHS[category].map(path => `category_path:${path}`), 'department:menswear']), numericFilters: JSON.stringify(numericFilters) })
  const result = await fetch(`https://${APP_ID}-dsn.algolia.net/1/indexes/Listing_sold_production/query`, { method: 'POST', headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ params: params.toString() }) })
  if (!result.ok) throw new Error(`Trend source failed: ${result.status}`)
  return result.json()
}

async function trends(requestUrl, response) {
  const category = requestUrl.searchParams.get('category_id') || 'sneakers'
  if (!PATHS[category]) return json(response, 400, { ok: false, error: 'Invalid category' })
  const periodType = requestUrl.searchParams.get('period_type') || 'days_30'
  const season = requestUrl.searchParams.get('season') || undefined, date = requestUrl.searchParams.get('date') || undefined
  const minRaw = requestUrl.searchParams.get('min_price'), maxRaw = requestUrl.searchParams.get('max_price')
  const min = minRaw == null ? undefined : Number(minRaw), max = maxRaw == null ? undefined : Number(maxRaw)
  const cacheKey = `${category}|${periodType}|${season || ''}|${date || ''}|${min ?? ''}|${max ?? ''}`
  const cached = trendsCache.get(cacheKey)
  if (cached && Date.now() - cached.time < 60_000 && requestUrl.searchParams.get('refresh') !== '1') return json(response, 200, { ...cached.value, analysis: { ...cached.value.analysis, from_cache: true } })
  const [start, end] = trendWindow(periodType, season, date)
  const first = await trendQuery(category, 0, start, end, min, max)
  const pageCount = Math.min(first.nbPages || 1, 8)
  const pages = pageCount > 1 ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => trendQuery(category, index + 1, start, end, min, max))) : []
  const hits = [...(first.hits || []), ...pages.flatMap(page => page.hits || [])]
  const groups = new Map()
  for (const hit of hits) {
    if (!categoryHitMatches(category, hit)) continue
    const brand = Array.isArray(hit.designer_names) ? hit.designer_names.join(' × ') : String(hit.designer_names || '')
    const key = keyFor(brand, String(hit.title || ''))
    if (!key.split('|')[1]) continue
    const group = groups.get(key) || { brand, priceTotal: 0, priceCount: 0, sellers: new Set(), image: null, count: 0 }
    const price = Number(hit.sold_price || hit.price); if (price) { group.priceTotal += price; group.priceCount++ }
    if (hit.user?.username) group.sellers.add(String(hit.user.username))
    group.image ||= hit.cover_photo?.url || hit.cover_photo?.image_url; group.count++; groups.set(key, group)
  }
  const ranked = [...groups].filter(([, group]) => group.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 10), maxCount = ranked[0]?.[1].count || 1
  const items = ranked.map(([key, group], index) => ({ rank: index + 1, model_key: key, title: pretty(key, group.brand), brand: group.brand, avg_price: group.priceCount ? group.priceTotal / group.priceCount : 0, sales_last_30d: group.count, seller_count: group.sellers.size, listing_count: group.count, trend_score: group.count / maxCount, grailed_url: `https://www.grailed.com/shop?query=${encodeURIComponent(key.replace('|', ' '))}`, image_url: previewUrl(group.image, 160), status: 'sold' }))
  const value = { category_id: category, period: { type: periodType, value: new Date(start * 1000).toISOString().slice(0, 10) }, generated_at: new Date().toISOString(), message: items.length ? undefined : 'В выбранном периоде и диапазоне нет повторных продаж моделей.', analysis: { sold_sample: hits.length, models_found: groups.size, ranked_by: min != null || max != null ? 'sales_in_period_and_price_band' : 'sales_in_period', from_cache: false }, items }
  trendsCache.set(cacheKey, { time: Date.now(), value })
  if (trendsCache.size > 100) trendsCache.delete(trendsCache.keys().next().value)
  return json(response, 200, value)
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
    'access-control-allow-origin': 'https://web.telegram.org',
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
  const extension = extname(file)
  const headers = { 'content-type': mime[extension] || 'application/octet-stream', 'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' }
  const compress = /\bgzip\b/.test(request.headers['accept-encoding'] || '') && ['.css', '.html', '.js', '.json', '.svg'].includes(extension)
  if (compress) {
    response.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding' })
    createReadStream(file).pipe(createGzip({ level: 6 })).pipe(response)
  } else {
    response.writeHead(200, headers)
    createReadStream(file).pipe(response)
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    if (request.url === '/health') return json(response, 200, { ok: true, bot: Boolean(token), web_app: Boolean(publicUrl) })
    if (url.pathname === '/api/trends' && request.method === 'GET') return await trends(url, response)
    const receiptMatch = url.pathname.match(/^\/api\/receipts\/((?:a4|thermal|email)-\d+)$/)
    if (receiptMatch && request.method === 'GET') return await serveReceipt(response, receiptMatch[1], url.searchParams.get('mode') === 'inline')
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
