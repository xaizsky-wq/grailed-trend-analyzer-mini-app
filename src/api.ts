export type Category = { id: string; name: string }
export type PeriodType = 'current' | 'days_7' | 'days_30' | 'days_90' | 'season' | 'custom_date'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type TrendItem = { rank: number; model_key: string; title: string; brand: string; avg_price: number; sales_last_30d: number; seller_count?: number; listing_count?: number; trend_score: number; grailed_url: string; image_url?: string | null; status?: string; favorites?: number }
export type SoldListing = { id: string; title: string; color: string | null; size: string | null; price: number; seller: string | null; sold_at: string | null; grailed_url: string; image_url?: string | null; photo_count?: number }
export type ModelItemsResponse = { category_id: string; model_key: string; total_sold: number; returned: number; items: SoldListing[] }
export type TrendsResponse = { category_id: string; period: { type: string; value: string }; generated_at: string; stale?: boolean; message?: string; analysis?: { sold_sample: number; models_found: number; ranked_by: string; from_cache?: boolean }; items: TrendItem[] }
export type PhotoListing = { id: string; title: string; brand: string; price: number; status: 'active' | 'sold'; grailed_url: string; image_url: string | null; color: string | null; size: string | null; sold_at: string | null; photo_count?: number; match_score?: number; matched_query?: string }
export type PhotoSearchResponse = { activeTotal: number; soldTotal: number; active: PhotoListing[]; sold: PhotoListing[]; query: string }
export type PhotoSearchQuery = { query: string; score: number }

const CATEGORIES: Category[] = [
  { id: 'sneakers', name: 'Кроссовки' }, { id: 'down_jackets', name: 'Пуховики' },
  { id: 'tshirts', name: 'Футболки' }, { id: 'bags', name: 'Сумки' },
  { id: 'hoodies', name: 'Худи' }, { id: 'sweatshirts', name: 'Свитшоты' },
  { id: 'pants', name: 'Брюки' }, { id: 'jeans', name: 'Джинсы' },
  { id: 'hats', name: 'Головные уборы' }, { id: 'watches', name: 'Часы' },
  { id: 'jewelry', name: 'Украшения' },
]
const PATHS: Record<string, string[]> = {
  sneakers: ['footwear.hitop_sneakers', 'footwear.lowtop_sneakers'], down_jackets: ['outerwear.parkas', 'outerwear.heavy_coats', 'outerwear.light_jackets'],
  tshirts: ['tops.short_sleeve_shirts', 'tops.long_sleeve_shirts'], bags: ['accessories.bags_luggage'],
  hoodies: ['tops.sweatshirts_hoodies'], sweatshirts: ['tops.sweatshirts_hoodies'],
  pants: ['bottoms.casual_pants', 'bottoms.sweatpants_joggers', 'bottoms.cropped_pants'], jeans: ['bottoms.denim'],
  hats: ['accessories.hats'], watches: ['accessories.jewelry_watches'], jewelry: ['accessories.jewelry_watches'],
}
const QUERIES: Record<string, string> = { down_jackets: 'puffer', sweatshirts: 'sweatshirt' }
const APP_ID = 'MNRWEFSS2Q'
const SEARCH_KEY = 'c89dbaddf15fe70e1941a109bf7c2a3d'

function previewUrl(value: unknown, width: number) {
  if (!value) return null
  try { const url = new URL(String(value)); url.searchParams.set('w', String(width)); return url.toString() }
  catch { return String(value) }
}

function listingSize(hit: any) {
  const raw = String(hit.size || '').trim()
  if (!raw) return null
  if (/one[ _-]?size/i.test(raw)) return 'One Size'
  if (String(hit.category || '').includes('footwear')) return `US ${raw.toUpperCase()}`
  return raw.toUpperCase()
}

export async function fetchCategories() { return CATEGORIES }

function windowFor(type: PeriodType, season?: Season, date?: string) {
  const end = new Date()
  let start = new Date(end)
  const days = { days_7: 7, days_30: 30, days_90: 90 } as const
  if (type === 'current') start = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0)
  else if (type in days) start.setDate(start.getDate() - days[type as keyof typeof days])
  else if (type === 'custom_date' && date) {
    const [year, month, day] = date.split('-').map(Number)
    start = new Date(year, month - 1, day, 0, 0, 0, 0)
    end.setTime(new Date(year, month - 1, day, 23, 59, 59, 999).getTime())
  }
  else if (type === 'season') {
    const month = { spring: 2, summer: 5, autumn: 8, winter: 11 }[season || 'winter']
    let year = end.getFullYear()
    let candidate = new Date(year, month, 1, 0, 0, 0, 0)
    if (candidate > end) { year--; candidate = new Date(year, month, 1, 0, 0, 0, 0) }
    start = candidate
    const seasonEnd = new Date(year, month + 3, 0, 23, 59, 59, 999)
    if (seasonEnd < end) end.setTime(seasonEnd.getTime())
  }
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)]
}

function categoryHitMatches(category: string, hit: any) {
  const text = `${hit.title || ''} ${Array.isArray(hit.designer_names) ? hit.designer_names.join(' ') : hit.designer_names || ''}`.toLowerCase()
  if (category === 'down_jackets') return /\b(puffer|down|nuptse|maya|expedition|parka)\b/.test(text)
  if (category === 'hoodies') return /\b(hoodie|hooded|zip[- ]?up)\b/.test(text)
  if (category === 'sweatshirts') return /\b(sweatshirt|crewneck|sweater)\b/.test(text)
  if (category === 'watches') return /\b(watch|rolex|submariner|datejust|santos|g[- ]?shock|casio|seiko|omega)\b/.test(text)
  if (category === 'jewelry') return /\b(jewelry|necklace|bracelet|ring|pendant|chain|earring|bangle|brooch)\b/.test(text)
  return true
}

function keyFor(brand: string, title: string) {
  const blob = `${brand} ${title}`.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/\b(?:air jordan|jordan)\s*(\d+)\b/, m => `jordan|jordan ${m[1]}`], [/\bdunk\s+(low|high)\b/, m => `nike|dunk ${m[1]}`],
    [/\b(?:air force\s*1|af1|air force)\b/, () => 'nike|air force 1'], [/\bair max\s*(\d+)\b/, m => `nike|air max ${m[1]}`],
    [/\byeezy\s+(\d+|slide|foam)\b/, m => `yeezy|yeezy ${m[1]}`], [/\bgats?\b/, () => 'maison margiela|gat'],
    [/\bnuptse\b/, () => 'the north face|nuptse'], [/\bbox logo\b/, () => 'supreme|box logo'],
    [/\bspeedy\s*(\d+)?\b/, m => `louis vuitton|speedy ${m[1] || ''}`.trim()], [/\bneverfull\b/, () => 'louis vuitton|neverfull'],
  ]
  for (const [re, fn] of patterns) { const match = blob.match(re); if (match) return fn(match) }
  const brandKey = (brand || 'other').split('×')[0].trim().toLowerCase()
  const stop = new Set(['the','and','for','with','new','mens','men','shirt','tee','shoes','sneakers','jacket','bag','size','vintage'])
  const words = title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !stop.has(w) && !/^\d{2,4}$/.test(w))
  return `${brandKey}|${words.slice(0, 2).join(' ')}`
}

async function query(category: string, page: number, start: number, end: number, min?: number, max?: number, textQuery?: string) {
  const numericFilters = [`sold_at_i>=${start}`, `sold_at_i<=${end}`]
  if (min != null) numericFilters.push(`price>=${min}`)
  if (max != null) numericFilters.push(`price<=${max}`)
  const search = new URLSearchParams({ query: textQuery ?? QUERIES[category] ?? '', hitsPerPage: '100', page: String(page), facetFilters: JSON.stringify([PATHS[category].map(p => `category_path:${p}`), 'department:menswear']), numericFilters: JSON.stringify(numericFilters) })
  const response = await fetch(`https://${APP_ID}-dsn.algolia.net/1/indexes/Listing_sold_production/query`, { method: 'POST', headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ params: search.toString() }) })
  if (!response.ok) throw new Error('Источник данных временно недоступен')
  return response.json() as Promise<{ hits: any[]; nbPages: number; nbHits: number }>
}

async function listingQuery(status: 'active' | 'sold', textQuery: string, page: number) {
  const allCategoryPaths = [...new Set(Object.values(PATHS).flat())]
  const filters = [allCategoryPaths.map(p => `category_path:${p}`), 'department:menswear']
  const search = new URLSearchParams({
    query: textQuery,
    hitsPerPage: '80',
    page: String(page),
    facetFilters: JSON.stringify(filters),
  })
  const index = status === 'sold' ? 'Listing_sold_production' : 'Listing_production'
  const response = await fetch(`https://${APP_ID}-dsn.algolia.net/1/indexes/${index}/query`, {
    method: 'POST',
    headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: search.toString() }),
  })
  if (!response.ok) throw new Error('Поиск Grailed временно недоступен')
  return response.json() as Promise<{ hits: any[]; nbHits: number }>
}

function toPhotoListing(hit: any, status: 'active' | 'sold'): PhotoListing {
  const id = String(hit.id || hit.objectID || '')
  const brand = Array.isArray(hit.designer_names) ? hit.designer_names.join(' × ') : String(hit.designer_names || '')
  const image = hit.cover_photo?.url || hit.cover_photo?.image_url || null
  const soldUnix = Number(hit.sold_at_i || hit.sold_at || 0)
  return {
    id,
    title: String(hit.title || 'Без названия'),
    brand,
    price: Number(status === 'sold' ? (hit.sold_price || hit.price || 0) : (hit.price || 0)),
    status,
    grailed_url: `https://www.grailed.com/listings/${id}`,
    image_url: previewUrl(image, 220),
    color: hit.color || hit.color_name || hit.colorway || null,
    size: listingSize(hit),
    sold_at: soldUnix ? new Date(soldUnix * 1000).toISOString() : null,
    photo_count: Number(hit.photo_count || 0),
  }
}

function queryTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(token => token.length > 1 && !['a', 'the', 'of', 'product', 'photo', 'mens', 'men'].includes(token))
}

function mergePhotoHits(groups: Array<{ hits: any[]; query: PhotoSearchQuery }>, status: 'active' | 'sold') {
  const merged = new Map<string, PhotoListing>()
  groups.forEach(group => group.hits.forEach((hit, rank) => {
    const listing = toPhotoListing(hit, status)
    if (!listing.id) return
    const haystack = `${listing.brand} ${listing.title}`.toLowerCase()
    const tokens = queryTokens(group.query.query)
    const overlap = tokens.length ? tokens.filter(token => haystack.includes(token)).length / tokens.length : 0
    const brandToken = tokens[0] && haystack.startsWith(tokens[0]) ? 0.12 : 0
    const score = Math.min(1, group.query.score * 0.52 + overlap * 0.36 + brandToken + Math.max(0, 0.08 - rank * 0.001))
    const previous = merged.get(listing.id)
    if (!previous || score > (previous.match_score || 0)) merged.set(listing.id, { ...listing, match_score: score, matched_query: group.query.query })
  }))
  return [...merged.values()].sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
}

export async function searchPhotoCandidates(input: string | PhotoSearchQuery[]): Promise<PhotoSearchResponse> {
  const raw = typeof input === 'string' ? [{ query: input, score: 1 }] : input
  const seen = new Set<string>()
  const queries = raw.map(item => ({ query: item.query.trim(), score: Math.max(0, Math.min(1, item.score)) })).filter(item => item.query && !seen.has(item.query.toLowerCase()) && seen.add(item.query.toLowerCase())).slice(0, 4)
  if (!queries.length) return { activeTotal: 0, soldTotal: 0, active: [], sold: [], query: '' }
  const tasks = queries.flatMap((query, queryIndex) => (['active', 'sold'] as const).flatMap(status => Array.from({ length: queryIndex === 0 ? 3 : 1 }, (_, page) => ({ status, query, page }))))
  const responses = await Promise.all(tasks.map(async task => ({ ...task, data: await listingQuery(task.status, task.query.query, task.page) })))
  const activeGroups = responses.filter(item => item.status === 'active').map(item => ({ hits: item.data.hits || [], query: item.query }))
  const soldGroups = responses.filter(item => item.status === 'sold').map(item => ({ hits: item.data.hits || [], query: item.query }))
  return {
    activeTotal: Math.max(...responses.filter(item => item.status === 'active').map(item => item.data.nbHits || 0), 0),
    soldTotal: Math.max(...responses.filter(item => item.status === 'sold').map(item => item.data.nbHits || 0), 0),
    active: mergePhotoHits(activeGroups, 'active'),
    sold: mergePhotoHits(soldGroups, 'sold'),
    query: queries.map(item => item.query).join(' · '),
  }
}

export async function fetchTrends(params: { category_id: string; period_type: PeriodType; season?: Season; date?: string; min_price?: number; max_price?: number; refresh?: boolean }): Promise<TrendsResponse> {
  const search = new URLSearchParams({ category_id: params.category_id, period_type: params.period_type })
  if (params.season) search.set('season', params.season)
  if (params.date) search.set('date', params.date)
  if (params.min_price != null) search.set('min_price', String(params.min_price))
  if (params.max_price != null) search.set('max_price', String(params.max_price))
  if (params.refresh) search.set('refresh', '1')
  const response = await fetch(`/api/trends?${search.toString()}`)
  if (!response.ok) throw new Error('Источник данных временно недоступен')
  return response.json() as Promise<TrendsResponse>
}

export async function fetchModelItems(params: { category_id: string; model_key: string; period_type: PeriodType; season?: Season; date?: string; min_price?: number; max_price?: number; limit?: number }): Promise<ModelItemsResponse> {
  const [start, end] = windowFor(params.period_type, params.season, params.date)
  const [brand, slug] = params.model_key.split('|')
  const searchText = slug?.split(' ').length > 1 ? slug : `${brand || ''} ${slug || ''}`.trim()
  const hits: any[] = []
  for (let page = 0; page < 3; page++) { const data = await query(params.category_id, page, start, end, params.min_price, params.max_price, searchText); hits.push(...(data.hits || [])); if (page + 1 >= data.nbPages) break }
  const matching = hits.filter(hit => {
    if (!categoryHitMatches(params.category_id, hit)) return false
    const hitBrand = Array.isArray(hit.designer_names) ? hit.designer_names.join(' × ') : String(hit.designer_names || '')
    return keyFor(hitBrand, String(hit.title || '')) === params.model_key
  })
  const limit = params.limit ?? 60
  const items = matching.slice(0, limit).map((hit): SoldListing => {
    const id = String(hit.id || hit.objectID || '')
    const soldUnix = Number(hit.sold_at_i || hit.sold_at || 0)
    const image = hit.cover_photo?.url || hit.cover_photo?.image_url || null
    return { id, title: String(hit.title || 'Без названия'), color: hit.color || hit.color_name || hit.colorway || null, size: listingSize(hit), price: Number(hit.sold_price || hit.price || 0), seller: hit.user?.username ? String(hit.user.username) : null, sold_at: soldUnix ? new Date(soldUnix * 1000).toISOString() : null, grailed_url: `https://www.grailed.com/listings/${id}`, image_url: previewUrl(image, 120), photo_count: Number(hit.photo_count || 0) }
  })
  return { category_id: params.category_id, model_key: params.model_key, total_sold: matching.length, returned: items.length, items }
}
