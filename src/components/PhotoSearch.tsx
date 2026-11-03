import { useEffect, useMemo, useRef, useState } from 'react'
import { searchPhotoCandidates, type PhotoListing } from '../api'

type Signature = number[]

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

async function signatureFromBlob(blob: Blob): Promise<Signature> {
  const canvas = document.createElement('canvas')
  canvas.width = 8; canvas.height = 8
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Браузер не поддерживает анализ изображения')
  if ('createImageBitmap' in window) {
    const image = await createImageBitmap(blob)
    ctx.drawImage(image, 0, 0, 8, 8)
    image.close()
  } else {
    const url = URL.createObjectURL(blob)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error('Не удалось прочитать изображение'))
        element.src = url
      })
      ctx.drawImage(image, 0, 0, 8, 8)
    } finally { URL.revokeObjectURL(url) }
  }
  const pixels = ctx.getImageData(0, 0, 8, 8).data
  const values: number[] = []
  for (let i = 0; i < pixels.length; i += 16) values.push(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255)
  return values
}

function similarity(a: Signature, b: Signature) {
  let error = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) error += (a[i] - b[i]) ** 2
  return Math.max(0, 1 - Math.sqrt(error / Math.min(a.length, b.length)))
}

async function rankVisually(items: PhotoListing[], source: Signature) {
  const scored = await Promise.all(items.slice(0, 40).map(async (item, index) => {
    if (!item.image_url) return { item, score: 0, index }
    try {
      const response = await fetch(item.image_url, { mode: 'cors', signal: AbortSignal.timeout(4500) })
      if (!response.ok) throw new Error()
      return { item, score: similarity(source, await signatureFromBlob(await response.blob())), index }
    } catch { return { item, score: 0, index } }
  }))
  return scored.sort((a, b) => (b.score - a.score) || (a.index - b.index)).map(x => x.item)
}

function cleanFilename(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/(?:img|image|photo|screenshot|dsc)[-_ ]*\d*/gi, ' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function ListingGrid({ items, empty }: { items: PhotoListing[]; empty: string }) {
  if (!items.length) return <p className="photo-empty">{empty}</p>
  return <div className="photo-grid">{items.map(item => (
    <a className="photo-card" href={item.grailed_url} target="_blank" rel="noreferrer" key={`${item.status}-${item.id}`}>
      {item.image_url ? <img src={item.image_url} alt="" /> : <div className="photo-placeholder" />}
      <div className="photo-card-body">
        <p className="brand">{item.brand || '—'}</p>
        <h4>{item.title}</h4>
        <p><strong>{money(item.price)}</strong>{item.color ? ` · ${item.color}` : ''}</p>
      </div>
    </a>
  ))}</div>
}

export function PhotoSearch() {
  const [file, setFile] = useState<File | null>(null)
  const [hint, setHint] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [active, setActive] = useState<PhotoListing[]>([])
  const [sold, setSold] = useState<PhotoListing[]>([])
  const [totals, setTotals] = useState({ active: 0, sold: 0 })
  const [tab, setTab] = useState<'active' | 'sold'>('active')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const query = useMemo(() => hint.trim() || (file ? cleanFilename(file.name) : ''), [hint, file])

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function search(selectedFile = file, selectedQuery = query) {
    if (!selectedFile) { setError('Сначала выберите фотографию товара.'); return }
    setLoading(true); setSearched(false); setError(null); setStatus('Анализируем фотографию…')
    try {
      const source = await signatureFromBlob(selectedFile)
      setStatus('Ищем актуальные и проданные лоты…')
      const result = await searchPhotoCandidates(selectedQuery)
      setStatus('Сравниваем изображения…')
      const [rankedActive, rankedSold] = await Promise.all([
        rankVisually(result.active, source), rankVisually(result.sold, source),
      ])
      setActive(rankedActive); setSold(rankedSold)
      setTotals({ active: result.activeTotal, sold: result.soldTotal })
      setSearched(true); setStatus('')
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось выполнить поиск') }
    finally { setLoading(false); setStatus('') }
  }

  function chooseFile(selectedFile: File | null) {
    setFile(selectedFile); setActive([]); setSold([]); setTotals({ active: 0, sold: 0 }); setSearched(false)
    if (selectedFile) void search(selectedFile, hint.trim() || cleanFilename(selectedFile.name))
  }

  return <section className="photo-search">
    <div className="photo-heading">
      <div><p className="eyebrow">visual match · beta</p><h2>Поиск по фото</h2></div>
      <p>Загрузите фото. Визуальный алгоритм сравнит его с изображениями в каталоге, а название бренда или модели сузит выборку.</p>
    </div>
    <div className="photo-form">
      <label className={`dropzone ${preview ? 'has-image' : ''}`}>
        {preview ? <img src={preview} alt="Загруженный товар" /> : <><span className="drop-icon">＋</span><strong>Выбрать фото</strong><small>JPG, PNG или WEBP</small></>}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => chooseFile(e.target.files?.[0] || null)} />
      </label>
      <div className="photo-fields">
        <label><span className="field-label">Бренд или модель — необязательно</span><input value={hint} onChange={e => setHint(e.target.value)} placeholder="Например: Maison Margiela GAT" /></label>
        <p className="field-help">Для точного поиска укажите то, что знаете. Поиск по фото работает по всем категориям и не зависит от фильтра трендов ниже.</p>
        <button className="primary" type="button" onClick={() => void search()} disabled={loading || !file}>{loading ? status || 'Ищем…' : searched ? 'Искать ещё раз' : 'Найти похожие лоты'}</button>
        {loading && <p className="search-status" role="status"><span />{status}</p>}
        {error && <p className="banner">{error}</p>}
      </div>
    </div>
    {searched && <div className="photo-results" ref={resultsRef}>
      <div className="result-tabs">
        <button className={tab === 'active' ? 'chip active' : 'chip'} onClick={() => setTab('active')}>Актуальные · {totals.active.toLocaleString('ru-RU')}</button>
        <button className={tab === 'sold' ? 'chip active' : 'chip'} onClick={() => setTab('sold')}>Проданные · {totals.sold.toLocaleString('ru-RU')}</button>
      </div>
      <p className="field-help">Показаны до 40 наиболее визуально похожих лотов из первых 80 совпадений. Счётчик показывает все найденные Grailed результаты.</p>
      {tab === 'active' ? <ListingGrid items={active} empty="Актуальных лотов не найдено." /> : <ListingGrid items={sold} empty="Проданных лотов не найдено." />}
    </div>}
  </section>
}
