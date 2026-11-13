import { useEffect, useRef, useState } from 'react'
import { searchPhotoCandidates, type PhotoListing } from '../api'
import { downloadListingGallery } from '../downloadImage'
import { SmartImage } from './SmartImage'

type Match = { query: string; score: number }
type ClassifierResult = { label: string; score: number }
type ImageClassifier = ((image: string, labels: string[]) => Promise<ClassifierResult[]>) & { dispose?: () => void | Promise<void> }
type FeatureTensor = { data: Float32Array | number[]; dims: number[] }
type ImageFeatureExtractor = ((images: string | string[]) => Promise<FeatureTensor>) & { dispose?: () => void | Promise<void> }

async function makeThumbnail(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url })
    const max = 160, scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d', { alpha: false })?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', .68)
  } finally { URL.revokeObjectURL(url) }
}

const PRODUCTS = [
  'Nike Air Force 1 sneakers', 'Nike Dunk Low sneakers', 'Nike Dunk High sneakers', 'Nike Air Max 95 sneakers', 'Nike Air Max 97 sneakers',
  'Nike Air Jordan 1 sneakers', 'Nike Air Jordan 3 sneakers', 'Nike Air Jordan 4 sneakers', 'Nike Air Jordan 5 sneakers', 'Nike Air Jordan 11 sneakers',
  'Adidas Samba sneakers', 'Adidas Gazelle sneakers', 'Adidas Campus sneakers', 'Adidas Superstar sneakers', 'Adidas Yeezy Boost 350 sneakers',
  'Yeezy Slide sandals', 'Yeezy Foam Runner shoes', 'New Balance 550 sneakers', 'New Balance 990 sneakers', 'New Balance 2002R sneakers',
  'Maison Margiela Replica GAT sneakers', 'Rick Owens Ramones sneakers', 'Rick Owens Geobasket sneakers', 'Rick Owens Tractor boots',
  'Balenciaga Triple S sneakers', 'Balenciaga Track sneakers', 'Balenciaga Speed Trainer sneakers', 'Balenciaga Arena sneakers',
  'Common Projects Achilles sneakers', 'Salomon XT-6 sneakers', 'ASICS Gel-Kayano 14 sneakers', 'Converse Chuck Taylor sneakers',
  'Vans Old Skool sneakers', 'Prada Monolith boots', 'Bottega Veneta Puddle boots', 'Timberland 6 Inch boots',
  'The North Face Nuptse puffer jacket', 'Canada Goose Expedition parka', 'Canada Goose Langford parka', 'Moncler Maya puffer jacket',
  'Arc\'teryx Beta jacket', 'Patagonia down jacket', 'Stone Island down jacket', 'Prada puffer jacket', 'Rick Owens puffer jacket',
  'Supreme Box Logo T-shirt', 'Supreme graphic T-shirt', 'Chrome Hearts T-shirt', 'Vintage band T-shirt', 'Vintage rap T-shirt',
  'Stussy T-shirt', 'Bape T-shirt', 'Off-White T-shirt', 'Balenciaga T-shirt', 'Maison Margiela T-shirt', 'Rick Owens T-shirt',
  'Louis Vuitton Speedy bag', 'Louis Vuitton Neverfull bag', 'Louis Vuitton Keepall bag', 'Goyard Saint Louis tote bag',
  'Dior Saddle bag', 'Balenciaga City bag', 'Prada Re-Nylon bag', 'Gucci Jackie bag', 'Bottega Veneta Cassette bag',
  'Chrome Hearts crossbody bag', 'Supreme shoulder bag', 'Arc\'teryx backpack', 'Telfar shopping bag',
  'Essentials hoodie', 'Supreme Box Logo hoodie', 'Stone Island hoodie', 'Nike Tech Fleece hoodie', 'Champion Reverse Weave sweatshirt',
  'Levi\'s 501 jeans', 'Rick Owens Bauhaus cargo pants', 'Carhartt double knee pants', 'Dickies 874 pants',
  'Supreme New Era cap', 'Chrome Hearts trucker hat', 'New Era Yankees cap',
  'Rolex Submariner watch', 'Cartier Santos watch', 'G-Shock watch',
  'Chrome Hearts jewelry', 'Tiffany & Co. necklace', 'Cartier Love bracelet',
]

const BRANDS = [
  'Nike', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 'Maison Margiela', 'Rick Owens', 'Balenciaga', 'Common Projects', 'Salomon', 'ASICS', 'Converse', 'Vans',
  'Prada', 'Bottega Veneta', 'Timberland', 'The North Face', 'Canada Goose', 'Moncler', "Arc'teryx", 'Patagonia', 'Stone Island', 'Supreme', 'Chrome Hearts',
  'Stussy', 'Bape', 'Off-White', 'Louis Vuitton', 'Goyard', 'Dior', 'Gucci', 'Telfar', 'Essentials', 'Levis', 'Carhartt', 'Dickies', 'Rolex', 'Cartier',
  'Tiffany & Co.', 'Burberry', 'Celine', 'Givenchy', 'Saint Laurent', 'Hermes', 'Fendi', 'Loewe', 'Jacquemus', 'Amiri', 'Palm Angels', 'Fear of God',
  'Gallery Dept.', 'Vetements', 'Comme des Garcons', 'Issey Miyake', 'Undercover', 'Kapital', 'Visvim', 'Sacai', 'Jil Sander', 'Raf Simons', 'Helmut Lang', 'Miu Miu',
]

const PRODUCT_TYPES = [
  'low top sneakers', 'high top sneakers', 'running shoes', 'boots', 'sandals', 'puffer jacket', 'parka', 'technical shell jacket', 'leather jacket', 'hoodie',
  'sweatshirt', 'T-shirt', 'button-up shirt', 'sweater', 'jeans', 'cargo pants', 'tailored pants', 'shorts', 'baseball cap', 'trucker hat', 'tote bag',
  'shoulder bag', 'crossbody bag', 'backpack', 'wallet', 'watch', 'necklace', 'bracelet', 'ring', 'sunglasses',
]

function money(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) }

function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0, aa = 0, bb = 0
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index++) { dot += a[index] * b[index]; aa += a[index] * a[index]; bb += b[index] * b[index] }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

async function visualRerank(extractor: ImageFeatureExtractor, file: File, items: PhotoListing[]) {
  const candidates = items.filter(item => item.image_url).slice(0, 36)
  if (!candidates.length) return items
  const sourceUrl = URL.createObjectURL(file)
  try {
    const source = await extractor(sourceUrl)
    const sourceVector = source.data
    const visualScores = new Map<string, number>()
    for (let start = 0; start < candidates.length; start += 6) {
      const group = candidates.slice(start, start + 6)
      const urls = group.map(item => `/api/image-proxy?url=${encodeURIComponent(item.image_url!)}`)
      try {
        const output = await extractor(urls)
        const width = output.dims.at(-1) || 512
        group.forEach((item, index) => {
          const vector = output.data.slice(index * width, (index + 1) * width)
          visualScores.set(item.id, Math.max(0, Math.min(1, cosine(sourceVector, vector))))
        })
      } catch { /* skip a batch when a remote image is unavailable */ }
    }
    return items.map(item => {
      const visual = visualScores.get(item.id)
      return visual == null ? item : { ...item, visual_score: visual, match_score: Math.min(1, visual * .72 + (item.match_score || 0) * .28) }
    }).sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  } finally { URL.revokeObjectURL(sourceUrl) }
}

function ListingGrid({ items, empty }: { items: PhotoListing[]; empty: string }) {
  const [visibleCount, setVisibleCount] = useState(18)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { setVisibleCount(18) }, [items])
  useEffect(() => {
    const element = loadMoreRef.current
    if (!element || visibleCount >= items.length) return
    if (!('IntersectionObserver' in window)) { setVisibleCount(items.length); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisibleCount(count => Math.min(items.length, count + 18))
    }, { rootMargin: '300px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [items.length, visibleCount])
  if (!items.length) return <p className="photo-empty">{empty}</p>
  return <><div className="photo-grid">{items.slice(0, visibleCount).map(item => <article className="photo-card" key={`${item.status}-${item.id}`}>
    <div className="photo-card-image">{item.image_url ? <><a href={item.grailed_url} target="_blank" rel="noreferrer"><SmartImage src={item.image_url} /></a><button type="button" className="image-download gallery-download" aria-label="Скачать все фото объявления" title={`Скачать все фото${item.photo_count ? ` (${item.photo_count})` : ''} в максимальном качестве`} onClick={() => void downloadListingGallery(item.id, item.title).catch(error => window.alert(error instanceof Error ? error.message : 'Не удалось скачать галерею'))}>ZIP</button></> : <div className="photo-placeholder" />}</div>
    <div className="photo-card-body"><p className="brand">{item.brand || '—'}</p><h4>{item.title}</h4><p className="listing-attributes">{item.match_score != null && <span className="match-chip">Совпадение {Math.round(item.match_score * 100)}%</span>}{item.size && <span className="size-chip">Размер {item.size}</span>}{item.color && <span className="color-chip">{item.color}</span>}</p><p><strong>{money(item.price)}</strong></p><a className="photo-card-link" href={item.grailed_url} target="_blank" rel="noreferrer">Лот ↗</a></div>
  </article>)}</div>{visibleCount < items.length && <div className="results-sentinel" ref={loadMoreRef} aria-label={`Показано ${visibleCount} из ${items.length}`}><span>{visibleCount} / {items.length}</span></div>}</>
}

export function PhotoSearch() {
  type BatchResult = { id: string; name: string; preview: string | null; matches: Match[]; active: PhotoListing[]; sold: PhotoListing[]; totals: { active: number; sold: number } }
  const [files, setFiles] = useState<File[]>([]), [hint, setHint] = useState(''), [previews, setPreviews] = useState<string[]>([])
  const [results, setResults] = useState<BatchResult[]>([]), [selectedResult, setSelectedResult] = useState(0)
  const [tab, setTab] = useState<'active' | 'sold'>('active'), [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(''), [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all(files.map(makeThumbnail)).then(urls => { if (!cancelled) setPreviews(urls) }).catch(() => { if (!cancelled) setPreviews([]) })
    return () => { cancelled = true }
  }, [files])

  async function search() {
    const manualQuery = hint.trim()
    if (!files.length && !manualQuery) { setError('Загрузите фото или введите название товара.'); return }
    setLoading(true); setError(null); setResults([]); setSelectedResult(0)
    let classifier: ImageClassifier | null = null
    let extractor: ImageFeatureExtractor | null = null
    try {
      const labels = PRODUCTS.map(product => `a product photo of ${product}`)
      if (files.length) {
        setStatus('Загружаем бесплатную AI-модель в браузер…')
        const { pipeline, env } = await import('@huggingface/transformers')
        env.allowLocalModels = false
        if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1
        classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
          progress_callback: (progress: { status?: string; progress?: number }) => {
            if (progress.status === 'progress' && typeof progress.progress === 'number') setStatus(`Загружаем AI-модель… ${Math.round(progress.progress)}%`)
          },
        }) as unknown as ImageClassifier
      }
      const queue: Array<{ file: File | null; preview: string | null }> = files.length ? files.map((file, index) => ({ file, preview: previews[index] || null })) : [{ file: null, preview: null }]
      const plans: Array<{ file: File | null; preview: string | null; ranked: Match[]; index: number }> = []
      for (let index = 0; index < queue.length; index++) {
        const item = queue[index]
        let ranked: Match[] = manualQuery ? [{ query: manualQuery, score: 1 }] : []
        if (item.file && classifier) {
          setStatus(`AI анализирует фото ${index + 1} из ${queue.length}: ${item.file.name}`)
          const imageUrl = URL.createObjectURL(item.file)
          try {
            const output = await classifier(imageUrl, labels)
            setStatus(`Определяем бренд и тип вещи ${index + 1} из ${queue.length}`)
            const brandOutput = await classifier(imageUrl, BRANDS.map(brand => `a fashion product made by ${brand}`))
            const typeOutput = await classifier(imageUrl, PRODUCT_TYPES.map(type => `a product photo of ${type}`))
            const aiMatches = output.slice(0, 5).map(row => ({ query: row.label.replace(/^a product photo of /, ''), score: row.score }))
            const brand = brandOutput[0]
            const productType = typeOutput[0]
            const combined = brand && productType ? [{ query: `${brand.label.replace(/^a fashion product made by /, '')} ${productType.label.replace(/^a product photo of /, '')}`, score: Math.sqrt(brand.score * productType.score) }] : []
            ranked = [...combined, ...aiMatches].sort((a, b) => b.score - a.score)
            if (manualQuery) ranked.unshift({ query: manualQuery, score: 1 })
          } finally { URL.revokeObjectURL(imageUrl) }
        }
        if (ranked[0]?.query) plans.push({ ...item, ranked, index })
      }
      try { await classifier?.dispose?.() } catch { /* best-effort */ }
      classifier = null
      if (plans.some(plan => plan.file)) {
        setStatus('Загружаем модуль визуального сравнения…')
        const { pipeline } = await import('@huggingface/transformers')
        extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32') as unknown as ImageFeatureExtractor
      }
      const batch: BatchResult[] = []
      for (const plan of plans) {
        setStatus(`Ищем активные и проданные лоты ${plan.index + 1} из ${queue.length}`)
        const found = await searchPhotoCandidates(plan.ranked.slice(0, 4))
        let active = found.active, sold = found.sold
        if (plan.file && extractor) {
          setStatus(`Сравниваем фото с лотами Grailed ${plan.index + 1} из ${queue.length}`)
          active = await visualRerank(extractor, plan.file, active)
          sold = await visualRerank(extractor, plan.file, sold)
        }
        batch.push({ id: `${plan.file?.name || 'text'}-${plan.index}`, name: plan.file?.name || manualQuery, preview: plan.preview, matches: plan.ranked.slice(0, 5), active, sold, totals: { active: found.activeTotal, sold: found.soldTotal } })
      }
      if (!batch.length) throw new Error('AI не смог определить товары')
      setResults(batch)
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось запустить локальную AI-модель') } finally {
      try { await classifier?.dispose?.() } catch { /* model cleanup is best-effort */ }
      try { await extractor?.dispose?.() } catch { /* model cleanup is best-effort */ }
      setLoading(false); setStatus('')
    }
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected) return
    const incoming = Array.from(selected).filter(file => file.type.startsWith('image/'))
    setFiles(current => [...current, ...incoming].slice(0, 10)); setResults([]); setError(null)
  }
  function removeFile(index: number) { setFiles(current => current.filter((_, itemIndex) => itemIndex !== index)); setResults([]) }

  const current = results[selectedResult]
  const best = current?.matches[0]
  return <section className="photo-search">
    <div className="photo-heading"><div><p className="eyebrow">CLIP vision · batch</p><h2>AI-поиск по фото</h2></div><p>Загрузите до 10 фотографий. AI последовательно определит каждый товар и отдельно найдёт для него актуальные и проданные лоты.</p></div>
    <div className="photo-form"><div><label className="dropzone multi-dropzone"><span className="drop-icon">＋</span><strong>{files.length ? 'Добавить ещё фото' : 'Выбрать несколько фото'}</strong><small>До 10 файлов · JPG, PNG или WEBP</small><input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { chooseFiles(event.target.files); event.target.value = '' }} /></label>
      {files.length > 0 && <div className="upload-queue">{files.map((file, index) => <div className="upload-item" key={`${file.name}-${file.lastModified}`}><img src={previews[index]} alt="" /><span>{file.name}</span><button type="button" aria-label={`Удалить ${file.name}`} onClick={() => removeFile(index)}>×</button></div>)}</div>}</div>
      <div className="photo-fields"><label><span className="field-label">Бренд, модель или название лота — необязательно</span><input value={hint} onChange={e => setHint(e.target.value)} placeholder="Например: Maison Margiela GAT" /></label>
        <p className="field-help">Одна подсказка применяется ко всем выбранным фото. AI-модель загружается один раз, затем обрабатывает очередь. Фотографии никуда не отправляются.</p>
        <button className="primary" type="button" onClick={() => void search()} disabled={loading || (!files.length && !hint.trim())}>{loading ? `Обработка ${results.length + 1} из ${files.length || 1}…` : results.length ? 'Повторить пакетный поиск' : files.length ? `Распознать ${files.length} фото` : 'Искать по названию'}</button>
        {loading && <p className="search-status" role="status"><span />{status}</p>}{error && <p className="banner">{error}</p>}
        {best && <div className="ai-result"><p className="field-label">AI определил · {current.name}</p><h3>{best.query}</h3><p>Уверенность {Math.round(best.score * 100)}%</p>{best.score < 0.18 && <p className="ai-warning">Низкая уверенность: добавьте бренд или модель в подсказку и повторите поиск.</p>}{current.matches.length > 1 && <p className="ai-alternatives">Другие варианты: {current.matches.slice(1, 4).map(x => x.query).join(', ')}</p>}</div>}
      </div></div>
    {current && <div className="photo-results" ref={resultsRef}>{results.length > 1 && <div className="batch-tabs">{results.map((result, index) => <button type="button" className={selectedResult === index ? 'batch-tab active' : 'batch-tab'} onClick={() => setSelectedResult(index)} key={result.id}>{result.preview && <img src={result.preview} alt="" />}<span>{index + 1}. {result.matches[0]?.query || result.name}</span></button>)}</div>}<div className="result-tabs"><button className={tab === 'active' ? 'chip active' : 'chip'} onClick={() => setTab('active')}>Актуальные · {current.totals.active.toLocaleString('ru-RU')}</button><button className={tab === 'sold' ? 'chip active' : 'chip'} onClick={() => setTab('sold')}>Проданные · {current.totals.sold.toLocaleString('ru-RU')}</button></div>
      <p className="field-help">Запрос: <strong>{best?.query}</strong>. Загружены все {tab === 'active' ? current.active.length : current.sold.length} результатов выборки; карточки вне экрана не отрисовываются.</p>{tab === 'active' ? <ListingGrid items={current.active} empty="Актуальных лотов не найдено." /> : <ListingGrid items={current.sold} empty="Проданных лотов не найдено." />}</div>}
  </section>
}
