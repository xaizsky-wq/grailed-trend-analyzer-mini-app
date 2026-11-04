import { useEffect, useRef, useState, type PointerEvent } from 'react'

type Area = { x: number; y: number; w: number; h: number }
type Point = { x: number; y: number }
const emptyArea: Area = { x: 0, y: 0, w: 0, h: 0 }

function contentAwareFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const canvas = ctx.canvas
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
  const src = source.data, dst = output.data
  const leftRoom = Math.max(1, x), rightRoom = Math.max(1, canvas.width - x - w)
  const topRoom = Math.max(1, y), bottomRoom = Math.max(1, canvas.height - y - h)
  const sample = (px: number, py: number, channel: number) => src[(Math.max(0, Math.min(canvas.height - 1, py)) * canvas.width + Math.max(0, Math.min(canvas.width - 1, px))) * 4 + channel]

  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const dl = px - x + 1, dr = x + w - px, dt = py - y + 1, db = y + h - py
    const candidates = [
      { x: x - Math.min(dl, leftRoom), y: py, weight: 1 / dl },
      { x: x + w - 1 + Math.min(dr, rightRoom), y: py, weight: 1 / dr },
      { x: px, y: y - Math.min(dt, topRoom), weight: 1 / dt },
      { x: px, y: y + h - 1 + Math.min(db, bottomRoom), weight: 1 / db },
    ]
    const diagonalWeight = .42
    candidates.push(
      { x: x - Math.min(dl, leftRoom), y: y - Math.min(dt, topRoom), weight: diagonalWeight / Math.hypot(dl, dt) },
      { x: x + w - 1 + Math.min(dr, rightRoom), y: y - Math.min(dt, topRoom), weight: diagonalWeight / Math.hypot(dr, dt) },
      { x: x - Math.min(dl, leftRoom), y: y + h - 1 + Math.min(db, bottomRoom), weight: diagonalWeight / Math.hypot(dl, db) },
      { x: x + w - 1 + Math.min(dr, rightRoom), y: y + h - 1 + Math.min(db, bottomRoom), weight: diagonalWeight / Math.hypot(dr, db) },
    )
    const total = candidates.reduce((sum, item) => sum + item.weight, 0)
    const i = (py * canvas.width + px) * 4
    for (let channel = 0; channel < 3; channel++) dst[i + channel] = candidates.reduce((sum, item) => sum + sample(item.x, item.y, channel) * item.weight, 0) / total
    dst[i + 3] = 255
  }

  ctx.putImageData(output, 0, 0)
  const feather = Math.max(2, Math.min(12, Math.round(Math.min(w, h) * .08)))
  const patch = document.createElement('canvas'); patch.width = w; patch.height = h
  const patchCtx = patch.getContext('2d')!; patchCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h)
  patchCtx.filter = `blur(${Math.max(2, Math.round(feather / 2))}px)`; patchCtx.drawImage(patch, 0, 0); patchCtx.filter = 'none'
  const softened = patchCtx.getImageData(0, 0, w, h)
  const filled = ctx.getImageData(x, y, w, h)
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const edge = Math.min(px, py, w - 1 - px, h - 1 - py)
    const mix = Math.max(0, Math.min(1, (feather - edge) / feather)) * .45
    const i = (py * w + px) * 4
    for (let channel = 0; channel < 3; channel++) filled.data[i + channel] = filled.data[i + channel] * (1 - mix) + softened.data[i + channel] * mix
  }
  ctx.putImageData(filled, x, y)
}

export function PhotoUnique() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [area, setArea] = useState<Area>(emptyArea)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function choose(next: File | null) {
    if (result) URL.revokeObjectURL(result)
    setFile(next); setArea(emptyArea); setResult(null); setMessage('')
  }

  function imagePoint(event: PointerEvent<HTMLDivElement>): Point {
    const image = imageRef.current
    if (!image) return { x: 0, y: 0 }
    const rect = image.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    return { x: Math.round(x * image.naturalWidth / rect.width), y: Math.round(y * image.naturalHeight / rect.height) }
  }

  function beginSelection(event: PointerEvent<HTMLDivElement>) {
    if (!preview || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = imagePoint(event); setDragStart(point)
    setArea({ x: point.x, y: point.y, w: 0, h: 0 }); setResult(null)
  }

  function moveSelection(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return
    const point = imagePoint(event)
    setArea({ x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y), w: Math.abs(point.x - dragStart.x), h: Math.abs(point.y - dragStart.y) })
  }

  function endSelection() {
    if (!dragStart) return
    setDragStart(null)
    setMessage(area.w > 2 && area.h > 2 ? 'Область выбрана. Рамку можно нарисовать заново.' : 'Нарисуйте рамку вокруг водяного знака.')
  }

  function autoDetect() {
    const image = imageRef.current
    if (!image) return
    const canvas = document.createElement('canvas'); const scale = Math.min(1, 500 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; const cells = 10
    let best = { score: -1, col: 0, row: 0 }
    for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
      let score = 0; const x0 = Math.floor(col * canvas.width / cells), x1 = Math.floor((col + 1) * canvas.width / cells); const y0 = Math.floor(row * canvas.height / cells), y1 = Math.floor((row + 1) * canvas.height / cells)
      for (let y = y0 + 1; y < y1; y += 2) for (let x = x0 + 1; x < x1; x += 2) {
        const i = (y * canvas.width + x) * 4, left = i - 4, top = i - canvas.width * 4
        const lum = pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114
        const lumLeft = pixels[left] * .299 + pixels[left + 1] * .587 + pixels[left + 2] * .114
        const lumTop = pixels[top] * .299 + pixels[top + 1] * .587 + pixels[top + 2] * .114
        score += Math.abs(lum - lumLeft) + Math.abs(lum - lumTop)
      }
      score *= row < 2 || row > 7 || col < 2 || col > 7 ? 1.35 : 1
      if (score > best.score) best = { score, col, row }
    }
    const cellW = image.naturalWidth / cells, cellH = image.naturalHeight / cells
    setArea({ x: Math.max(0, Math.round((best.col - .5) * cellW)), y: Math.max(0, Math.round((best.row - .5) * cellH)), w: Math.round(cellW * 2), h: Math.round(cellH * 2) })
    setResult(null); setMessage('Найдена вероятная область. Проверьте рамку и поправьте её мышью, если нужно.')
  }

  async function process() {
    if (!file) return
    if (area.w < 3 || area.h < 3) { setMessage('Сначала выделите область мышью.'); return }
    setBusy(true); setMessage('Удаляем выбранную область и очищаем метаданные…')
    try {
      const image = new Image(); const source = URL.createObjectURL(file); image.src = source
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось открыть фото')) }); URL.revokeObjectURL(source)
      const canvas = document.createElement('canvas'); const scale = Math.min(1, 2200 / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const x = Math.round(area.x * scale), y = Math.round(area.y * scale), w = Math.min(canvas.width - x, Math.round(area.w * scale)), h = Math.min(canvas.height - y, Math.round(area.h * scale))
      contentAwareFill(ctx, x, y, w, h)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .92)); if (!blob) throw new Error('Не удалось подготовить файл')
      if (result) URL.revokeObjectURL(result); setResult(URL.createObjectURL(blob)); setMessage('Готово: область удалена, исходные EXIF-метаданные очищены.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось обработать фото') } finally { setBusy(false) }
  }

  const image = imageRef.current
  const style = image && area.w > 0 ? { left: `${area.x / image.naturalWidth * 100}%`, top: `${area.y / image.naturalHeight * 100}%`, width: `${area.w / image.naturalWidth * 100}%`, height: `${area.h / image.naturalHeight * 100}%` } : undefined

  return <section className="photo-search unique-tool">
    <div className="photo-heading"><div><p className="eyebrow">REMOVER · LOCAL</p><h2>Remover</h2></div><p>Загрузите своё изображение, обведите водяной знак мышью и скачайте очищенную копию. Фото остаётся в браузере.</p></div>
    {!preview ? <label className="dropzone remover-upload"><span className="drop-icon">＋</span><strong>Выбрать фото</strong><small>JPG, PNG или WEBP</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choose(e.target.files?.[0] || null)} /></label> : <>
      <div className="remover-workspace" onPointerDown={beginSelection} onPointerMove={moveSelection} onPointerUp={endSelection} onPointerCancel={endSelection}>
        <img ref={imageRef} src={preview} alt="Фото для обработки" draggable={false} onLoad={() => setMessage('Обведите водяной знак мышью или попробуйте автоопределение.')} />
        {style && <div className="remover-selection" style={style}><span>{area.w} × {area.h}</span></div>}
      </div>
      <div className="remover-actions">
        <label className="chip replace-photo">Другое фото<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choose(e.target.files?.[0] || null)} /></label>
        <button className="chip" type="button" onClick={autoDetect}>Найти автоматически</button>
        <button className="chip" type="button" onClick={() => { setArea(emptyArea); setResult(null); setMessage('Обведите водяной знак мышью.') }}>Сбросить рамку</button>
        <button className="primary" type="button" onClick={() => void process()} disabled={busy || area.w < 3 || area.h < 3}>{busy ? 'Обработка…' : 'Удалить с заполнением'}</button>
      </div>
      {message && <p className="search-status" role="status">{busy && <span />}{message}</p>}
      {result && <div className="remover-result"><img src={result} alt="Обработанный результат" /><a className="primary download-link" href={result} download={`grailed-clean-${Date.now()}.jpg`}>Скачать очищенное фото</a></div>}
    </>}
  </section>
}
