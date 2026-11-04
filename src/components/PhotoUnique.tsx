import { useEffect, useRef, useState, type PointerEvent } from 'react'

type Area = { x: number; y: number; w: number; h: number }
type Point = { x: number; y: number }
const emptyArea: Area = { x: 0, y: 0, w: 0, h: 0 }

function contentAwareFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, smartMask: boolean) {
  const canvas = ctx.canvas
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
  const src = source.data, dst = output.data
  const width = canvas.width, height = canvas.height
  const targetMask = new Uint8Array(width * height)
  if (smartMask) {
    const blurredCanvas = document.createElement('canvas'); blurredCanvas.width = width; blurredCanvas.height = height
    const blurredCtx = blurredCanvas.getContext('2d')!; blurredCtx.filter = `blur(${Math.max(4, Math.min(14, Math.round(Math.min(w, h) * .06)))}px)`; blurredCtx.drawImage(canvas, 0, 0)
    const blurred = blurredCtx.getImageData(0, 0, width, height).data
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const i = (py * width + px) * 4
      const max = Math.max(src[i], src[i + 1], src[i + 2]), min = Math.min(src[i], src[i + 1], src[i + 2])
      const contrast = (Math.abs(src[i] - blurred[i]) + Math.abs(src[i + 1] - blurred[i + 1]) + Math.abs(src[i + 2] - blurred[i + 2])) / 3
      const neutral = max - min < 58, extreme = max > 188 || min < 72
      if (contrast > 22 && (neutral || extreme || contrast > 46)) targetMask[py * width + px] = 1
    }
    const expanded = targetMask.slice()
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (targetMask[py * width + px]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const ex = px + dx, ey = py + dy
        if (ex >= x && ex < x + w && ey >= y && ey < y + h && dx * dx + dy * dy <= 5) expanded[ey * width + ex] = 1
      }
    }
    targetMask.set(expanded)
  } else {
    for (let py = y; py < y + h; py++) targetMask.fill(1, py * width + x, py * width + x + w)
  }
  const inside = (px: number, py: number) => px >= 0 && px < width && py >= 0 && py < height && targetMask[py * width + px] === 1
  const known = new Uint8Array(width * height); known.fill(1)
  let maskedPixels = 0
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (targetMask[py * width + px]) { known[py * width + px] = 0; maskedPixels++ }
  if (smartMask && maskedPixels < Math.max(12, w * h * .002)) throw new Error('В выделении не найден водяной знак. Обведите его плотнее или включите ручное удаление всей области.')
  const pixels: Array<{ x: number; y: number; layer: number }> = []
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (targetMask[py * width + px]) pixels.push({ x: px, y: py, layer: Math.min(px - x, x + w - 1 - px, py - y, y + h - 1 - py) })
  pixels.sort((a, b) => a.layer - b.layer || ((a.x * 73856093 ^ a.y * 19349663) - (b.x * 73856093 ^ b.y * 19349663)))
  const offsets = [-18, -10, -5, 0, 5, 10, 18]
  const neighbors = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
  const clampX = (value: number) => Math.max(0, Math.min(width - 1, value))
  const clampY = (value: number) => Math.max(0, Math.min(height - 1, value))

  for (const pixel of pixels) {
    const candidates: Array<[number, number]> = []
    for (const shift of offsets) {
      candidates.push([clampX(x - 1 - pixel.layer), clampY(pixel.y + shift)])
      candidates.push([clampX(x + w + pixel.layer), clampY(pixel.y + shift)])
      candidates.push([clampX(pixel.x + shift), clampY(y - 1 - pixel.layer)])
      candidates.push([clampX(pixel.x + shift), clampY(y + h + pixel.layer)])
    }
    let best = candidates[0], bestScore = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      if (inside(candidate[0], candidate[1])) continue
      let score = 0, compared = 0
      for (const [dx, dy] of neighbors) {
        const tx = pixel.x + dx, ty = pixel.y + dy
        if (tx < 0 || tx >= width || ty < 0 || ty >= height || !known[ty * width + tx]) continue
        const sx = clampX(candidate[0] + dx), sy = clampY(candidate[1] + dy)
        const ti = (ty * width + tx) * 4, si = (sy * width + sx) * 4
        score += Math.abs(dst[ti] - src[si]) + Math.abs(dst[ti + 1] - src[si + 1]) + Math.abs(dst[ti + 2] - src[si + 2]); compared++
      }
      if (compared && score / compared < bestScore) { bestScore = score / compared; best = candidate }
    }
    const target = (pixel.y * width + pixel.x) * 4, chosen = (best[1] * width + best[0]) * 4
    dst[target] = src[chosen]; dst[target + 1] = src[chosen + 1]; dst[target + 2] = src[chosen + 2]; dst[target + 3] = 255
    known[pixel.y * width + pixel.x] = 1
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
    const mix = targetMask[(y + py) * width + x + px] ? Math.max(0, Math.min(1, (feather - edge) / feather)) * .2 : 0
    const i = (py * w + px) * 4
    for (let channel = 0; channel < 3; channel++) filled.data[i + channel] = filled.data[i + channel] * (1 - mix) + softened.data[i + channel] * mix
  }
  ctx.putImageData(filled, x, y)
  return maskedPixels
}

export function PhotoUnique() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [area, setArea] = useState<Area>(emptyArea)
  const [smartMask, setSmartMask] = useState(true)
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
      const changed = contentAwareFill(ctx, x, y, w, h, smartMask)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .92)); if (!blob) throw new Error('Не удалось подготовить файл')
      if (result) URL.revokeObjectURL(result); setResult(URL.createObjectURL(blob)); setMessage(smartMask ? `Готово: распознано и восстановлено ${changed.toLocaleString('ru-RU')} пикселей водяного знака. Детали фото сохранены.` : 'Готово: вся выделенная область восстановлена, EXIF-метаданные очищены.')
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
      <label className="smart-mask-toggle"><input type="checkbox" checked={smartMask} onChange={event => setSmartMask(event.target.checked)} /><span><strong>Распознавать только водяной знак</strong><small>Сохраняет пиксели фотографии внутри рамки. Отключите только если знак не распознаётся.</small></span></label>
      {message && <p className="search-status" role="status">{busy && <span />}{message}</p>}
      {result && <div className="remover-result"><img src={result} alt="Обработанный результат" /><a className="primary download-link" href={result} download={`grailed-clean-${Date.now()}.jpg`}>Скачать очищенное фото</a></div>}
    </>}
  </section>
}
