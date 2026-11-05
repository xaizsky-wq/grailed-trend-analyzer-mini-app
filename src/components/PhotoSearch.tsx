import { useEffect, useRef, useState } from 'react'
import { searchPhotoCandidates, type PhotoListing } from '../api'
import { downloadListingGallery } from '../downloadImage'

type Match = { query: string; score: number }
type ClassifierResult = { label: string; score: number }

async function classifierImage(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = source
    })
    const size = 384, scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d', { alpha: false })?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', .82)
  } finally { URL.revokeObjectURL(source) }
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

function money(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) }

function ListingGrid({ items, empty }: { items: PhotoListing[]; empty: string }) {
  if (!items.length) return <p className="photo-empty">{empty}</p>
  return <div className="photo-grid">{items.slice(0, 20).map(item => <article className="photo-card" key={`${item.status}-${item.id}`}>
    <div className="photo-card-image">{item.image_url ? <><a href={item.grailed_url} target="_blank" rel="noreferrer"><img src={item.image_url} alt="" loading="lazy" decoding="async" /></a><button type="button" className="image-download gallery-download" aria-label="Скачать все фото объявления" title={`Скачать все фото${item.photo_count ? ` (${item.photo_count})` : ''} в максимальном качестве`} onClick={() => void downloadListingGallery(item.id, item.title).catch(error => window.alert(error instanceof Error ? error.message : 'Не удалось скачать галерею'))}>ZIP</button></> : <div className="photo-placeholder" />}</div>
    <div className="photo-card-body"><p className="brand">{item.brand || '—'}</p><h4>{item.title}</h4><p><strong>{money(item.price)}</strong>{item.color ? ` · ${item.color}` : ''}</p><a className="photo-card-link" href={item.grailed_url} target="_blank" rel="noreferrer">Лот ↗</a></div>
  </article>)}</div>
}

export function PhotoSearch() {
  type BatchResult = { id: string; name: string; preview: string | null; matches: Match[]; active: PhotoListing[]; sold: PhotoListing[]; totals: { active: number; sold: number } }
  const [files, setFiles] = useState<File[]>([]), [hint, setHint] = useState(''), [previews, setPreviews] = useState<string[]>([])
  const [results, setResults] = useState<BatchResult[]>([]), [selectedResult, setSelectedResult] = useState(0)
  const [tab, setTab] = useState<'active' | 'sold'>('active'), [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(''), [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [files])

  async function search() {
    const manualQuery = hint.trim()
    if (!files.length && !manualQuery) { setError('Загрузите фото или введите название товара.'); return }
    setLoading(true); setError(null); setResults([]); setSelectedResult(0)
    try {
      let classifier: ((image: string, labels: string[]) => Promise<ClassifierResult[]>) | null = null
      const labels = PRODUCTS.map(product => `a product photo of ${product}`)
      if (files.length && !manualQuery) {
        setStatus('Загружаем бесплатную AI-модель в браузер…')
        const { pipeline, env } = await import('@huggingface/transformers')
        env.allowLocalModels = false
        if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1
        classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
          dtype: 'q8',
          progress_callback: (progress: { status?: string; progress?: number }) => {
            if (progress.status === 'progress' && typeof progress.progress === 'number') setStatus(`Загружаем AI-модель… ${Math.round(progress.progress)}%`)
          },
        }) as unknown as (image: string, labels: string[]) => Promise<ClassifierResult[]>
      }
      const queue: Array<{ file: File | null; preview: string | null }> = files.length ? files.map((file, index) => ({ file, preview: previews[index] || null })) : [{ file: null, preview: null }]
      const batch: BatchResult[] = []
      for (let index = 0; index < queue.length; index++) {
        const item = queue[index]
        let ranked: Match[] = manualQuery ? [{ query: manualQuery, score: 1 }] : []
        if (item.file && classifier) {
          setStatus(`AI анализирует фото ${index + 1} из ${queue.length}: ${item.file.name}`)
          const imageUrl = await classifierImage(item.file)
          const output = await classifier(imageUrl, labels)
          const aiMatches = output.slice(0, 5).map(row => ({ query: row.label.replace(/^a product photo of /, ''), score: row.score }))
          ranked = manualQuery ? [...ranked, ...aiMatches] : aiMatches
        }
        const query = ranked[0]?.query
        if (!query) continue
        setStatus(`Ищем лоты для фото ${index + 1} из ${queue.length}: ${query}`)
        const found = await searchPhotoCandidates(query)
        batch.push({ id: `${item.file?.name || 'text'}-${index}`, name: item.file?.name || manualQuery, preview: item.preview, matches: ranked.slice(0, 5), active: found.active, sold: found.sold, totals: { active: found.activeTotal, sold: found.soldTotal } })
        setResults([...batch])
      }
      if (!batch.length) throw new Error('AI не смог определить товары')
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось запустить локальную AI-модель') } finally { setLoading(false); setStatus('') }
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
        <p className="field-help">Если ввести бренд или модель, поиск будет мгновенным и без запуска тяжёлой AI-модели. Без подсказки AI анализирует уменьшенную копию фото локально.</p>
        <button className="primary" type="button" onClick={() => void search()} disabled={loading || (!files.length && !hint.trim())}>{loading ? `Обработка ${results.length + 1} из ${files.length || 1}…` : results.length ? 'Повторить пакетный поиск' : files.length ? `Распознать ${files.length} фото` : 'Искать по названию'}</button>
        {loading && <p className="search-status" role="status"><span />{status}</p>}{error && <p className="banner">{error}</p>}
        {best && <div className="ai-result"><p className="field-label">AI определил · {current.name}</p><h3>{best.query}</h3><p>Уверенность {Math.round(best.score * 100)}%</p>{best.score < 0.18 && <p className="ai-warning">Низкая уверенность: добавьте бренд или модель в подсказку и повторите поиск.</p>}{current.matches.length > 1 && <p className="ai-alternatives">Другие варианты: {current.matches.slice(1, 4).map(x => x.query).join(', ')}</p>}</div>}
      </div></div>
    {current && <div className="photo-results" ref={resultsRef}>{results.length > 1 && <div className="batch-tabs">{results.map((result, index) => <button type="button" className={selectedResult === index ? 'batch-tab active' : 'batch-tab'} onClick={() => setSelectedResult(index)} key={result.id}>{result.preview && <img src={result.preview} alt="" />}<span>{index + 1}. {result.matches[0]?.query || result.name}</span></button>)}</div>}<div className="result-tabs"><button className={tab === 'active' ? 'chip active' : 'chip'} onClick={() => setTab('active')}>Актуальные · {current.totals.active.toLocaleString('ru-RU')}</button><button className={tab === 'sold' ? 'chip active' : 'chip'} onClick={() => setTab('sold')}>Проданные · {current.totals.sold.toLocaleString('ru-RU')}</button></div>
      <p className="field-help">Запрос: <strong>{best?.query}</strong>. Показаны первые 40 Grailed результатов для выбранного фото.</p>{tab === 'active' ? <ListingGrid items={current.active} empty="Актуальных лотов не найдено." /> : <ListingGrid items={current.sold} empty="Проданных лотов не найдено." />}</div>}
  </section>
}
