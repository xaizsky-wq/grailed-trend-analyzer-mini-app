import { useEffect, useRef, useState } from 'react'
import { searchPhotoCandidates, type PhotoListing } from '../api'

type Match = { query: string; score: number }
type ClassifierResult = { label: string; score: number }

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
]

function money(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) }

function ListingGrid({ items, empty }: { items: PhotoListing[]; empty: string }) {
  if (!items.length) return <p className="photo-empty">{empty}</p>
  return <div className="photo-grid">{items.slice(0, 40).map(item => <a className="photo-card" href={item.grailed_url} target="_blank" rel="noreferrer" key={`${item.status}-${item.id}`}>
    {item.image_url ? <img src={item.image_url} alt="" /> : <div className="photo-placeholder" />}
    <div className="photo-card-body"><p className="brand">{item.brand || '—'}</p><h4>{item.title}</h4><p><strong>{money(item.price)}</strong>{item.color ? ` · ${item.color}` : ''}</p></div>
  </a>)}</div>
}

export function PhotoSearch() {
  const [file, setFile] = useState<File | null>(null), [hint, setHint] = useState(''), [preview, setPreview] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([]), [active, setActive] = useState<PhotoListing[]>([]), [sold, setSold] = useState<PhotoListing[]>([])
  const [totals, setTotals] = useState({ active: 0, sold: 0 }), [tab, setTab] = useState<'active' | 'sold'>('active'), [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { if (!file) { setPreview(null); return }; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])

  async function search(selectedFile = file) {
    if (!selectedFile) { setError('Сначала выберите фотографию товара.'); return }
    setLoading(true); setSearched(false); setError(null); setMatches([])
    try {
      const imageUrl = URL.createObjectURL(selectedFile)
      setStatus('Загружаем бесплатную AI-модель в браузер…')
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = false
      const classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        progress_callback: (progress: { status?: string; progress?: number }) => {
          if (progress.status === 'progress' && typeof progress.progress === 'number') setStatus(`Загружаем AI-модель… ${Math.round(progress.progress)}%`)
        },
      })
      setStatus('AI определяет бренд и модель…')
      const labels = PRODUCTS.map(product => `a product photo of ${product}`)
      const output = await classifier(imageUrl, labels) as ClassifierResult[]
      URL.revokeObjectURL(imageUrl)
      const ranked = output.slice(0, 5).map(row => ({ query: row.label.replace(/^a product photo of /, ''), score: row.score }))
      if (hint.trim()) ranked.unshift({ query: hint.trim(), score: 1 })
      setMatches(ranked.slice(0, 5))
      const query = ranked[0]?.query
      if (!query) throw new Error('AI не смог определить товар')
      setStatus(`Ищем ${query} на Grailed…`)
      const result = await searchPhotoCandidates(query)
      setActive(result.active); setSold(result.sold); setTotals({ active: result.activeTotal, sold: result.soldTotal }); setSearched(true)
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось запустить локальную AI-модель') } finally { setLoading(false); setStatus('') }
  }

  function chooseFile(selectedFile: File | null) { setFile(selectedFile); setActive([]); setSold([]); setTotals({ active: 0, sold: 0 }); setSearched(false); setMatches([]); if (selectedFile) void search(selectedFile) }

  const best = matches[0]
  return <section className="photo-search">
    <div className="photo-heading"><div><p className="eyebrow">CLIP vision · бесплатно</p><h2>AI-поиск по фото</h2></div><p>Открытая AI-модель работает прямо на вашем устройстве: определяет наиболее похожий бренд и модель, затем ищет лоты на Grailed.</p></div>
    <div className="photo-form"><label className={`dropzone ${preview ? 'has-image' : ''}`}>{preview ? <img src={preview} alt="Загруженный товар" /> : <><span className="drop-icon">＋</span><strong>Выбрать фото</strong><small>JPG, PNG или WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => chooseFile(e.target.files?.[0] || null)} /></label>
      <div className="photo-fields"><label><span className="field-label">Бренд или модель — необязательно</span><input value={hint} onChange={e => setHint(e.target.value)} placeholder="Например: Maison Margiela GAT" /></label>
        <p className="field-help">Первый запуск загружает AI-модель и может занять до минуты. Фото никуда не отправляется.</p>
        <button className="primary" type="button" onClick={() => void search()} disabled={loading || !file}>{loading ? 'AI анализирует…' : searched ? 'Распознать ещё раз' : 'Распознать и найти'}</button>
        {loading && <p className="search-status" role="status"><span />{status}</p>}{error && <p className="banner">{error}</p>}
        {best && <div className="ai-result"><p className="field-label">AI определил</p><h3>{best.query}</h3><p>Уверенность {Math.round(best.score * 100)}%</p>{best.score < 0.18 && <p className="ai-warning">Низкая уверенность: добавьте бренд или модель в подсказку и повторите поиск.</p>}{matches.length > 1 && <p className="ai-alternatives">Другие варианты: {matches.slice(1, 4).map(x => x.query).join(', ')}</p>}</div>}
      </div></div>
    {searched && <div className="photo-results" ref={resultsRef}><div className="result-tabs"><button className={tab === 'active' ? 'chip active' : 'chip'} onClick={() => setTab('active')}>Актуальные · {totals.active.toLocaleString('ru-RU')}</button><button className={tab === 'sold' ? 'chip active' : 'chip'} onClick={() => setTab('sold')}>Проданные · {totals.sold.toLocaleString('ru-RU')}</button></div>
      <p className="field-help">Запрос: <strong>{best?.query}</strong>. Показаны первые 40 Grailed результатов.</p>{tab === 'active' ? <ListingGrid items={active} empty="Актуальных лотов не найдено." /> : <ListingGrid items={sold} empty="Проданных лотов не найдено." />}</div>}
  </section>
}
