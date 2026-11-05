export type Category = { id: string; name: string }
export type PeriodType = 'current' | 'days_7' | 'days_30' | 'days_90' | 'season' | 'custom_date'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type TrendItem = { rank: number; model_key: string; title: string; brand: string; avg_price: number; sales_last_30d: number; seller_count?: number; listing_count?: number; trend_score: number; grailed_url: string; image_url?: string | null; status?: string; favorites?: number }
export type SoldListing = { id: string; title: string; color: string | null; price: number; seller: string | null; sold_at: string | null; grailed_url: string; image_url?: string | null; photo_count?: number }
export type ModelItemsResponse = { category_id: string; model_key: string; total_sold: number; returned: number; items: SoldListing[] }
export type TrendsResponse = { category_id: string; period: { type: string; value: string }; generated_at: string; stale?: boolean; message?: string; analysis?: { sold_sample: number; models_found: number; ranked_by: string; from_cache?: boolean }; items: TrendItem[] }
export type PhotoListing = { id: string; title: string; brand: string; price: number; status: 'active' | 'sold'; grailed_url: string; image_url: string | null; color: string | null; sold_at: string | null; photo_count?: number }
export type PhotoSearchResponse = { activeTotal: number; soldTotal: number; active: PhotoListing[]; sold: PhotoListing[]; query: string }

const CATEGORIES: Category[] = [
  { id: 'sneakers', name: 'Кроссовки' }, { id: 'down_jackets', name: 'Пуховики' },
  { id: 'tshirts', name: 'Футболки' }, { id: 'bags', name: 'Сумки' },
  { id: 'hoodies', name: 'Худи' }, { id: 'sweatshirts', name: 'Свитшоты' },
  { id: 'pants', name: 'Брюки' }, { id: 'jeans', name: 'Джинсы' },
  { id: 'hats', name: 'Головные уборы' }, { id: 'watches', name: 'Часы' },
  { id: 'jewelry', name: 'Украшения' },
]
const PATHS: Record<string, string[]> = {
  sneakers: ['footwear.hitop_sneakers', 'footwear.lowtop_sneakers'], down_jackets: ['outerwear.parkas'],
  tshirts: ['tops.short_sleeve_shirts', 'tops.long_sleeve_shirts'], bags: ['accessories.bags_luggage'],
  hoodies: ['tops.hoodies'], sweatshirts: ['tops.sweatshirts'], pants: ['bottoms.pants'], jeans: ['bottoms.jeans'],
  hats: ['accessories.hats'], watches: ['accessories.watches'], jewelry: ['accessories.jewelry'],
}
const QUERIES: Record<string, string> = { down_jackets: 'down jacket OR puffer OR canada goose' }
const APP_ID = 'MNRWEFSS2Q'
const SEARCH_KEY = 'c89dbaddf15fe70e1941a109bf7c2a3d'

export async function fetchCategories() { return CATEGORIES }

function windowFor(type: PeriodType, season?: Season, date?: string) {
  const end = new Date()
  let start = new Date(end)
  const days = { current: 1, days_7: 7, days_30: 30, days_90: 90 } as const
  if (type in days) start.setDate(start.getDate() - days[type as keyof typeof days])
  else if (type === 'custom_date' && date) { start = new Date(`${date}T00:00:00Z`); end.setTime(new Date(`${date}T23:59:59Z`).getTime()) }
  else if (type === 'season') {
    const months = { spring: 2, summer: 5, autumn: 8, winter: 11 }
    const month = months[season || 'winter']; let year = end.getUTCFullYear()
    if (month === 11 ? end.getUTCMonth() < 2 : end.getUTCMonth() < month) year--
    start = new Date(Date.UTC(year, month, 1))
    const seasonEnd = new Date(Date.UTC(year + (month === 11 ? 1 : 0), (month + 3) % 12, 0, 23, 59, 59))
    if (seasonEnd < end) end.setTime(seasonEnd.getTime())
  }
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)]
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

function pretty(key: string, brand: string) {
  const slug = key.split('|')[1] || key
  return `${brand.split('×')[0].trim()} ${slug.split(' ').map(x => ['gat','sb'].includes(x) ? x.toUpperCase() : (x[0]?.toUpperCase() || '') + x.slice(1)).join(' ')}`.trim()
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
    image_url: image ? `${image}${String(image).includes('?') ? '' : '?w=360'}` : null,
    color: hit.color || hit.color_name || hit.colorway || null,
    sold_at: soldUnix ? new Date(soldUnix * 1000).toISOString() : null,
    photo_count: Number(hit.photo_count || 0),
  }
}

export async function searchPhotoCandidates(textQuery: string): Promise<PhotoSearchResponse> {
  const normalized = textQuery.trim()
  const [activeData, soldData] = await Promise.all([
    listingQuery('active', normalized, 0),
    listingQuery('sold', normalized, 0),
  ])
  return {
    activeTotal: activeData.nbHits || 0,
    soldTotal: soldData.nbHits || 0,
    active: (activeData.hits || []).map(hit => toPhotoListing(hit, 'active')),
    sold: (soldData.hits || []).map(hit => toPhotoListing(hit, 'sold')),
    query: normalized,
  }
}

export async function fetchTrends(params: { category_id: string; period_type: PeriodType; season?: Season; date?: string; min_price?: number; max_price?: number; refresh?: boolean }): Promise<TrendsResponse> {
  const [start, end] = windowFor(params.period_type, params.season, params.date)
  const hits: any[] = []
  for (let page = 0; page < 8; page++) { const data = await query(params.category_id, page, start, end, params.min_price, params.max_price); hits.push(...(data.hits || [])); if (page + 1 >= data.nbPages) break }
  const groups = new Map<string, { brand: string; prices: number[]; sellers: Set<string>; image?: string; count: number }>()
  for (const hit of hits) {
    const brand = Array.isArray(hit.designer_names) ? hit.designer_names.join(' × ') : String(hit.designer_names || '')
    const title = String(hit.title || ''); const key = keyFor(brand, title); if (!key.split('|')[1]) continue
    const group: { brand: string; prices: number[]; sellers: Set<string>; image?: string; count: number } = groups.get(key) || { brand, prices: [], sellers: new Set<string>(), image: undefined, count: 0 }
    const price = Number(hit.sold_price || hit.price); if (price) group.prices.push(price)
    const seller = hit.user?.username; if (seller) group.sellers.add(String(seller))
    group.image ||= hit.cover_photo?.url || hit.cover_photo?.image_url; group.count++; groups.set(key, group)
  }
  const ranked = [...groups].filter(([, group]) => group.count >= 2).sort((a,b) => b[1].count - a[1].count).slice(0,10)
  const maxCount = ranked[0]?.[1].count || 1
  const items = ranked.map(([key,group], index): TrendItem => ({ rank: index+1, model_key: key, title: pretty(key,group.brand), brand: group.brand, avg_price: group.prices.length ? group.prices.reduce((a,b)=>a+b,0)/group.prices.length : 0, sales_last_30d: group.count, seller_count: group.sellers.size, listing_count: group.count, trend_score: group.count/maxCount, grailed_url: `https://www.grailed.com/shop?query=${encodeURIComponent(key.replace('|',' '))}`, image_url: group.image ? `${group.image}${group.image.includes('?') ? '' : '?w=400'}` : null, status: 'sold' }))
  return { category_id: params.category_id, period: { type: params.period_type, value: new Date(start*1000).toISOString().slice(0,10) }, generated_at: new Date().toISOString(), message: items.length ? undefined : 'В выбранном периоде и диапазоне нет повторных продаж моделей.', analysis: { sold_sample: hits.length, models_found: groups.size, ranked_by: params.min_price != null || params.max_price != null ? 'sales_in_period_and_price_band' : 'sales_in_period', from_cache: false }, items }
}

export async function fetchModelItems(params: { category_id: string; model_key: string; period_type: PeriodType; season?: Season; date?: string; min_price?: number; max_price?: number; limit?: number }): Promise<ModelItemsResponse> {
  const [start, end] = windowFor(params.period_type, params.season, params.date)
  const [brand, slug] = params.model_key.split('|')
  const searchText = slug?.split(' ').length > 1 ? slug : `${brand || ''} ${slug || ''}`.trim()
  const hits: any[] = []
  for (let page = 0; page < 3; page++) { const data = await query(params.category_id, page, start, end, params.min_price, params.max_price, searchText); hits.push(...(data.hits || [])); if (page + 1 >= data.nbPages) break }
  const matching = hits.filter(hit => {
    const hitBrand = Array.isArray(hit.designer_names) ? hit.designer_names.join(' × ') : String(hit.designer_names || '')
    return keyFor(hitBrand, String(hit.title || '')) === params.model_key
  })
  const limit = params.limit ?? 60
  const items = matching.slice(0, limit).map((hit): SoldListing => {
    const id = String(hit.id || hit.objectID || '')
    const soldUnix = Number(hit.sold_at_i || hit.sold_at || 0)
    const image = hit.cover_photo?.url || hit.cover_photo?.image_url || null
    return { id, title: String(hit.title || 'Без названия'), color: hit.color || hit.color_name || hit.colorway || null, price: Number(hit.sold_price || hit.price || 0), seller: hit.user?.username ? String(hit.user.username) : null, sold_at: soldUnix ? new Date(soldUnix * 1000).toISOString() : null, grailed_url: `https://www.grailed.com/listings/${id}`, image_url: image ? `${image}${String(image).includes('?') ? '' : '?w=240'}` : null, photo_count: Number(hit.photo_count || 0) }
  })
  return { category_id: params.category_id, model_key: params.model_key, total_sold: matching.length, returned: items.length, items }
}
