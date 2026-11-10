import { useMemo, useRef, useState } from 'react'

type EditorData = {
  studio: string
  project: string
  item: string
  sku: string
  size: string
  color: string
  price: string
  currency: string
  tax: string
  date: string
  reference: string
}

const initialData: EditorData = {
  studio: 'ARCHIVE LAB',
  project: 'PRODUCT SAMPLE',
  item: 'Technical Nylon Jacket',
  sku: 'AL-2026-001',
  size: 'M',
  color: 'Graphite',
  price: '420',
  currency: 'EUR',
  tax: '20',
  date: new Date().toISOString().slice(0, 10),
  reference: 'DEMO-2026-001',
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!)
}

function barcodeBits(value: string) {
  const source = value || 'DEMO'
  let bits = '101011'
  for (const char of source) {
    const code = char.charCodeAt(0)
    bits += code.toString(2).padStart(8, '0') + ((code % 3) ? '10' : '110')
  }
  return (bits + '110101').slice(0, 118)
}

function makeSvg(data: EditorData) {
  const price = Math.max(0, Number(data.price) || 0)
  const taxRate = Math.max(0, Number(data.tax) || 0)
  const tax = price * taxRate / (100 + taxRate)
  const bars = barcodeBits(data.reference)
  const barWidth = 380 / bars.length
  const barRects = [...bars].map((bit, index) => bit === '1' ? `<rect x="${90 + index * barWidth}" y="612" width="${Math.max(1, barWidth * .82)}" height="82"/>` : '').join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="820" viewBox="0 0 560 820" role="img" aria-label="Демонстрационный документ ${escapeXml(data.item)}">
  <rect width="560" height="820" fill="#f8f7f2"/>
  <rect x="24" y="24" width="512" height="772" rx="4" fill="none" stroke="#171717" stroke-width="2"/>
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#171717}.muted{fill:#626262}.mono{font-family:monospace}.caps{font-weight:700;letter-spacing:2px}.line{stroke:#171717;stroke-width:1}</style>
  <text x="52" y="72" font-size="12" class="caps">${escapeXml(data.studio)}</text>
  <text x="508" y="72" font-size="11" text-anchor="end" class="mono">${escapeXml(data.reference)}</text>
  <line x1="52" x2="508" y1="92" y2="92" class="line"/>
  <text x="52" y="132" font-size="10" class="caps muted">DIGITAL PRODUCT RECORD</text>
  <text x="52" y="174" font-size="30" font-weight="700">${escapeXml(data.project)}</text>
  <text x="52" y="218" font-size="17" font-weight="700">${escapeXml(data.item)}</text>
  <text x="52" y="247" font-size="12" class="mono muted">SKU  ${escapeXml(data.sku)}</text>
  <line x1="52" x2="508" y1="276" y2="276" class="line"/>
  <text x="52" y="310" font-size="10" class="caps muted">SPECIFICATION</text>
  <text x="52" y="348" font-size="12" class="muted">SIZE</text><text x="180" y="348" font-size="14" font-weight="700">${escapeXml(data.size)}</text>
  <text x="52" y="380" font-size="12" class="muted">COLOR</text><text x="180" y="380" font-size="14" font-weight="700">${escapeXml(data.color)}</text>
  <text x="52" y="412" font-size="12" class="muted">DATE</text><text x="180" y="412" font-size="14" font-weight="700">${escapeXml(data.date)}</text>
  <line x1="52" x2="508" y1="446" y2="446" class="line"/>
  <text x="52" y="480" font-size="10" class="caps muted">VALUE SUMMARY</text>
  <text x="52" y="526" font-size="12" class="muted">TOTAL</text><text x="508" y="526" font-size="28" font-weight="700" text-anchor="end">${price.toFixed(2)} ${escapeXml(data.currency)}</text>
  <text x="52" y="558" font-size="12" class="muted">INCLUDED TAX ${taxRate.toFixed(1)}%</text><text x="508" y="558" font-size="13" text-anchor="end">${tax.toFixed(2)} ${escapeXml(data.currency)}</text>
  <g fill="#171717">${barRects}</g>
  <text x="280" y="716" text-anchor="middle" font-size="12" class="mono">${escapeXml(data.reference)}</text>
  <text x="280" y="760" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.5">DEMO · NOT A RECEIPT · SAMPLE</text>
  <g transform="rotate(-31 280 410)" opacity=".12"><text x="280" y="430" text-anchor="middle" font-size="82" font-weight="900">SAMPLE</text></g>
  </svg>`
}

export function TemplateEditor() {
  const [data, setData] = useState<EditorData>(() => {
    try { return { ...initialData, ...JSON.parse(localStorage.getItem('safe-template-project') || '{}') } }
    catch { return initialData }
  })
  const [saved, setSaved] = useState(false)
  const svg = useMemo(() => makeSvg(data), [data])
  const previewRef = useRef<HTMLDivElement>(null)

  const update = (key: keyof EditorData, value: string) => {
    setData(current => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const save = () => {
    localStorage.setItem('safe-template-project', JSON.stringify(data))
    setSaved(true)
  }

  const downloadPng = async () => {
    const image = new Image()
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось создать изображение')); image.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = 1120
    canvas.height = 1640
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas недоступен')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    const link = document.createElement('a')
    link.download = `${(data.reference || 'demo').replace(/[^a-z0-9_-]+/gi, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return <section className="template-editor">
    <div className="photo-heading editor-heading">
      <div><p className="eyebrow">SAFE TEMPLATE LAB</p><h2>Редактор макетов</h2></div>
      <p>Создавайте демонстрационные карточки товара. Каждый экспорт содержит постоянную маркировку SAMPLE.</p>
    </div>
    <div className="editor-layout">
      <form className="editor-form" onSubmit={event => event.preventDefault()}>
        <div className="editor-section"><p className="field-label">Проект</p>
          <label>Название студии<input value={data.studio} onChange={e => update('studio', e.target.value)} maxLength={28}/></label>
          <label>Название проекта<input value={data.project} onChange={e => update('project', e.target.value)} maxLength={32}/></label>
          <label>Референс<input value={data.reference} onChange={e => update('reference', e.target.value)} maxLength={28}/></label>
        </div>
        <div className="editor-section"><p className="field-label">Товар</p>
          <label className="editor-wide">Название вещи<input value={data.item} onChange={e => update('item', e.target.value)} maxLength={46}/></label>
          <label>Артикул / SKU<input value={data.sku} onChange={e => update('sku', e.target.value)} maxLength={28}/></label>
          <label>Размер<input value={data.size} onChange={e => update('size', e.target.value)} maxLength={12}/></label>
          <label>Цвет<input value={data.color} onChange={e => update('color', e.target.value)} maxLength={24}/></label>
          <label>Дата<input type="date" value={data.date} onChange={e => update('date', e.target.value)}/></label>
        </div>
        <div className="editor-section"><p className="field-label">Расчёт</p>
          <label>Стоимость<input type="number" min="0" step="0.01" value={data.price} onChange={e => update('price', e.target.value)}/></label>
          <label>Валюта<select value={data.currency} onChange={e => update('currency', e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option><option>UAH</option></select></label>
          <label>Налог, %<input type="number" min="0" max="100" step="0.1" value={data.tax} onChange={e => update('tax', e.target.value)}/></label>
        </div>
        <div className="editor-actions">
          <button type="button" className="primary" onClick={save}>{saved ? 'Сохранено ✓' : 'Сохранить проект'}</button>
          <button type="button" className="chip" onClick={() => void downloadPng().catch(error => window.alert(error.message))}>Скачать PNG</button>
          <button type="button" className="chip" onClick={() => window.print()}>PDF / Печать</button>
          <button type="button" className="chip" onClick={() => setData(initialData)}>Сбросить</button>
        </div>
      </form>
      <div className="editor-preview-column">
        <div className="editor-preview-label"><span>LIVE PREVIEW</span><small>560 × 820</small></div>
        <div className="editor-preview" ref={previewRef} dangerouslySetInnerHTML={{ __html: svg }}/>
        <p className="editor-note">Маркировка SAMPLE встроена в документ и экспорт.</p>
      </div>
    </div>
  </section>
}
