import { useEffect, useState } from 'react'

type Profile = 'iphone' | 'android' | 'compressed' | 'screenshot'

const profiles: Array<{ id: Profile; title: string; note: string }> = [
  { id: 'iphone', title: 'iPhone-like', note: 'тёплый баланс, лёгкая резкость и шум' },
  { id: 'android', title: 'Android-like', note: 'более холодный цвет и контраст' },
  { id: 'compressed', title: 'Messenger JPEG', note: 'сильное сжатие, малый размер и блоки' },
  { id: 'screenshot', title: 'Screenshot', note: 'повторное масштабирование и рамка' },
]

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото')) }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Ошибка JPEG')), 'image/jpeg', quality))
}

async function makeVariant(file: File, profile: Profile, strength: number) {
  const image = await loadImage(file), max = profile === 'compressed' ? 900 : 1600
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('Canvas unavailable')
  if (profile === 'iphone') ctx.filter = `contrast(${1 + strength * .05}) saturate(${1 + strength * .06}) sepia(${strength * .025})`
  if (profile === 'android') ctx.filter = `contrast(${1 + strength * .09}) saturate(${1 + strength * .1}) hue-rotate(${-strength * 2}deg)`
  if (profile === 'compressed') ctx.filter = `contrast(${1 + strength * .04}) saturate(${1 - strength * .08})`
  ctx.drawImage(image, 0, 0, width, height); ctx.filter = 'none'
  const pixels = ctx.getImageData(0, 0, width, height), amount = strength * (profile === 'compressed' ? 18 : 7)
  for (let i = 0; i < pixels.data.length; i += 4) { const noise = (Math.random() - .5) * amount; pixels.data[i] += noise; pixels.data[i + 1] += noise; pixels.data[i + 2] += noise }
  ctx.putImageData(pixels, 0, 0)
  if (profile === 'screenshot') { ctx.strokeStyle = 'rgba(20,20,20,.75)'; ctx.lineWidth = Math.max(4, width * .012); ctx.strokeRect(0, 0, width, height) }
  ctx.font = `700 ${Math.max(12, Math.round(width * .018))}px Arial`; ctx.textBaseline = 'bottom'
  const label = `QA TEST · ${profile.toUpperCase()} · ${Math.round(strength * 100)}%`
  const pad = Math.max(8, width * .012), metrics = ctx.measureText(label)
  ctx.fillStyle = 'rgba(0,0,0,.58)'; ctx.fillRect(pad, height - pad * 3.3, metrics.width + pad * 1.5, pad * 2.5)
  ctx.fillStyle = '#fff'; ctx.fillText(label, pad * 1.5, height - pad * 1.35)
  const quality = profile === 'compressed' ? Math.max(.35, .72 - strength * .3) : .88
  return canvasBlob(canvas, quality)
}

export function ModerationQA() {
  const [file, setFile] = useState<File | null>(null), [profile, setProfile] = useState<Profile>('iphone'), [strength, setStrength] = useState(.45)
  const [source, setSource] = useState<string | null>(null), [result, setResult] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { if (!file) { setSource(null); return }; const url = URL.createObjectURL(file); setSource(url); return () => URL.revokeObjectURL(url) }, [file])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result) }, [result])
  async function generate() {
    if (!file) return; setBusy(true); setMessage('Создаём тестовый вариант…')
    try { const blob = await makeVariant(file, profile, strength); if (result) URL.revokeObjectURL(result); setResult(URL.createObjectURL(blob)); setMessage('Готово. EXIF не создаётся; вариант помечен QA TEST.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка обработки') } finally { setBusy(false) }
  }
  return <section className="photo-search moderation-qa">
    <div className="photo-heading"><div><p className="eyebrow">INTERNAL TESTING</p><h2>Moderation QA</h2></div><p>Генератор контролируемых визуальных артефактов для проверки вашей модерации.</p></div>
    <div className="photo-form"><label className={`dropzone ${source ? 'has-image' : ''}`}>{source ? <img src={source} alt="Исходное QA-фото" /> : <><span className="drop-icon">＋</span><strong>Выбрать QA-фото</strong><small>JPG, PNG или WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] || null); setResult(null); setMessage('') }} /></label>
      <div className="photo-fields"><div className="qa-profiles">{profiles.map(item => <button type="button" key={item.id} className={profile === item.id ? 'chip active' : 'chip'} onClick={() => setProfile(item.id)}><strong>{item.title}</strong><small>{item.note}</small></button>)}</div>
        <label className="mask-sensitivity"><span className="field-label">Сила артефактов: {Math.round(strength * 100)}%</span><input type="range" min="0.1" max="1" step="0.05" value={strength} onChange={event => setStrength(Number(event.target.value))} /></label>
        <p className="field-help">Режим не подделывает дату, EXIF или модель устройства. Каждое фото помечается QA TEST.</p>
        <button className="primary" type="button" disabled={!file || busy} onClick={() => void generate()}>{busy ? 'Генерация…' : 'Создать QA-вариант'}</button>{message && <p className="search-status" role="status">{busy && <span />}{message}</p>}
      </div></div>
    {result && <div className="remover-result"><img src={result} alt="QA-вариант" /><a className="primary download-link" href={result} download={`moderation-qa-${profile}-${Date.now()}.jpg`}>Скачать QA-вариант</a></div>}
  </section>
}
