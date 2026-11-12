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

const fieldAliases: Record<keyof EditorData, string[]> = {
  studio: ['studio', 'студия', 'магазин', 'бренд'],
  project: ['project', 'проект', 'заголовок', 'коллекция'],
  item: ['item', 'товар', 'вещь', 'название', 'модель'],
  sku: ['sku', 'артикул', 'код товара'],
  size: ['size', 'размер'],
  color: ['color', 'colour', 'цвет'],
  price: ['price', 'цена', 'стоимость', 'сумма'],
  currency: ['currency', 'валюта'],
  tax: ['tax', 'налог', 'ндс', 'vat'],
  date: ['date', 'дата'],
  reference: ['reference', 'референс', 'номер', 'заказ'],
}

function normalizeCurrency(value: string) {
  const upper = value.trim().toUpperCase()
  if (/^(€|EUR|ЕВРО)$/.test(upper)) return 'EUR'
  if (/^(\$|USD|ДОЛЛАР(?:Ы|ОВ)?)$/.test(upper)) return 'USD'
  if (/^(£|GBP|ФУНТ(?:Ы|ОВ)?)$/.test(upper)) return 'GBP'
  if (/^(₴|UAH|ГРН|ГРИВ(?:НА|НЫ|ЕН))$/.test(upper)) return 'UAH'
  return upper
}

function normalizeDate(value: string) {
  const clean = value.trim()
  const match = clean.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (!match) return clean
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

export function parseItemRequest(request: string): Partial<EditorData> {
  const result: Partial<EditorData> = {}
  const aliases = Object.entries(fieldAliases) as [keyof EditorData, string[]][]
  for (const rawLine of request.split(/\n|;/)) {
    const line = rawLine.trim().replace(/^[-•]\s*/, '')
    const parts = line.match(/^([^:=—–-]+?)\s*(?::|=|—|–|\s-\s)\s*(.+)$/)
    if (!parts) continue
    const entry = aliases.find(([, names]) => names.includes(parts[1].trim().toLowerCase()))
    if (!entry) continue
    const key = entry[0]
    const value = parts[2].trim()
    result[key] = key === 'currency' ? normalizeCurrency(value)
      : key === 'date' ? normalizeDate(value)
        : key === 'price' || key === 'tax' ? value.replace(/[^\d.,-]/g, '').replace(',', '.')
          : value
  }
  const price = request.match(/(?:цена|стоимость|сумма)\s*(?:[:=—–-]\s*)?([\d\s]+(?:[.,]\d{1,2})?)\s*(EUR|USD|GBP|UAH|€|\$|£|₴|грн)?/i)
  if (price) {
    result.price ??= price[1].replace(/\s/g, '').replace(',', '.')
    if (price[2]) result.currency ??= normalizeCurrency(price[2])
  }
  const size = request.match(/(?:размер|size)\s*(?:[:=—–-]\s*)?([\w./-]{1,12})/i)
  if (size) result.size ??= size[1]
  return result
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

function makeSvg(data: EditorData, customTemplate?: string | null) {
  const price = Math.max(0, Number(data.price) || 0)
  const taxRate = Math.max(0, Number(data.tax) || 0)
  const tax = price * taxRate / (100 + taxRate)
  const bars = barcodeBits(data.reference)
  const barWidth = 380 / bars.length
  const barRects = [...bars].map((bit, index) => bit === '1' ? `<rect x="${90 + index * barWidth}" y="612" width="${Math.max(1, barWidth * .82)}" height="82"/>` : '').join('')
  if (customTemplate) {
    const compactBars = [...bars].map((bit, index) => bit === '1' ? `<rect x="${90 + index * barWidth}" y="688" width="${Math.max(1, barWidth * .82)}" height="42"/>` : '').join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="820" viewBox="0 0 560 820" role="img" aria-label="Демонстрационный документ ${escapeXml(data.item)}">
    <rect width="560" height="820" fill="#f8f7f2"/><image href="${escapeXml(customTemplate)}" x="24" y="24" width="512" height="402" preserveAspectRatio="xMidYMid meet"/>
    <rect x="24" y="426" width="512" height="370" fill="#f8f7f2"/><rect x="24" y="24" width="512" height="772" rx="4" fill="none" stroke="#171717" stroke-width="2"/>
    <style>text{font-family:Arial,Helvetica,sans-serif;fill:#171717}.muted{fill:#626262}.mono{font-family:monospace}.caps{font-weight:700;letter-spacing:2px}.line{stroke:#171717;stroke-width:1}</style>
    <text x="52" y="460" font-size="10" class="caps muted">${escapeXml(data.studio)} · DIGITAL PRODUCT RECORD</text><text x="508" y="460" text-anchor="end" font-size="10" class="mono">${escapeXml(data.reference)}</text>
    <text x="52" y="500" font-size="25" font-weight="700">${escapeXml(data.project)}</text><text x="52" y="532" font-size="16" font-weight="700">${escapeXml(data.item)}</text>
    <text x="52" y="558" font-size="11" class="mono muted">SKU ${escapeXml(data.sku)} · SIZE ${escapeXml(data.size)} · ${escapeXml(data.color)}</text><line x1="52" x2="508" y1="578" y2="578" class="line"/>
    <text x="52" y="608" font-size="11" class="muted">DATE ${escapeXml(data.date)} · TAX ${taxRate.toFixed(1)}%</text><text x="508" y="612" font-size="24" font-weight="700" text-anchor="end">${price.toFixed(2)} ${escapeXml(data.currency)}</text>
    <text x="508" y="638" font-size="11" class="muted" text-anchor="end">included tax ${tax.toFixed(2)} ${escapeXml(data.currency)}</text><g fill="#171717">${compactBars}</g>
    <text x="280" y="748" text-anchor="middle" font-size="10" class="mono">${escapeXml(data.reference)}</text><text x="280" y="776" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="1.2">DEMO · NOT A RECEIPT · SAMPLE</text>
    <g transform="rotate(-31 280 380)" opacity=".13"><text x="280" y="400" text-anchor="middle" font-size="72" font-weight="900">SAMPLE</text></g></svg>`
  }
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
  const [customTemplate, setCustomTemplate] = useState<{ name: string; dataUrl: string } | null>(null)
  const [importMessage, setImportMessage] = useState('SVG, PNG, JPG, WEBP или сохранённый проект JSON')
  const [itemRequest, setItemRequest] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const svg = useMemo(() => makeSvg(data, customTemplate?.dataUrl), [data, customTemplate])
  const previewRef = useRef<HTMLDivElement>(null)

  const update = (key: keyof EditorData, value: string) => {
    setData(current => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const save = () => {
    localStorage.setItem('safe-template-project', JSON.stringify(data))
    setSaved(true)
  }

  const applyItemRequest = () => {
    const parsed = parseItemRequest(itemRequest)
    const recognized = Object.keys(parsed).length
    if (!recognized) {
      setRequestMessage('Поля не распознаны. Используйте формат «Название: …», «Размер: …», «Цена: …».')
      return
    }
    setData(current => ({ ...current, ...parsed }))
    setSaved(false)
    setRequestMessage(`Обновлено полей: ${recognized}`)
  }

  const importFile = async (file?: File) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'ai' || extension === 'pdf') {
      setImportMessage('AI/PDF нужно сначала экспортировать в SVG или PNG — браузер не сохраняет их редактируемые слои.')
      return
    }
    if (extension === 'json') {
      try {
        const parsed = JSON.parse(await file.text()) as Partial<EditorData>
        const allowed = Object.keys(initialData) as (keyof EditorData)[]
        const clean = Object.fromEntries(allowed.filter(key => typeof parsed[key] === 'string').map(key => [key, parsed[key]]))
        setData(current => ({ ...current, ...clean }))
        setImportMessage(`Проект «${file.name}» загружен`)
        setSaved(false)
      } catch { setImportMessage('Не удалось прочитать JSON-проект') }
      return
    }
    if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImportMessage('Неподдерживаемый формат. Используйте SVG, PNG, JPG, WEBP или JSON.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setImportMessage('Файл больше 8 МБ. Уменьшите его перед загрузкой.')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
      reader.readAsDataURL(file)
    })
    setCustomTemplate({ name: file.name, dataUrl })
    setImportMessage(`Основа «${file.name}» загружена. Поля и SAMPLE добавляются поверх.`)
  }

  const downloadProject = () => {
    const link = document.createElement('a')
    link.download = `${(data.reference || 'demo-project').replace(/[^a-z0-9_-]+/gi, '-')}.json`
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 0)
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
        <div className="editor-request">
          <div className="editor-request-heading"><div><p className="field-label">Запрос пользователя</p><strong>Заполнить документ под вещь</strong></div><small>{requestMessage || 'По одному полю в строке'}</small></div>
          <textarea value={itemRequest} onChange={event => { setItemRequest(event.target.value); setRequestMessage('') }} placeholder={'Название: Prada Re-Nylon Jacket\nАртикул: SGB685\nРазмер: M\nЦвет: Black\nЦена: 1850 EUR\nДата: 12.11.2026'} rows={7}/>
          <button type="button" className="primary" onClick={applyItemRequest}>Применить запрос</button>
        </div>
        <div className="editor-import">
          <div><p className="field-label">Свой файл</p><strong>{customTemplate?.name || 'Загрузите шаблон или проект'}</strong><small>{importMessage}</small></div>
          <label className="primary editor-file-button">Выбрать файл<input type="file" accept=".svg,.png,.jpg,.jpeg,.webp,.json,.ai,.pdf" onChange={event => { void importFile(event.target.files?.[0]).catch(error => setImportMessage(error.message)); event.target.value = '' }}/></label>
          {customTemplate && <button type="button" className="chip" onClick={() => { setCustomTemplate(null); setImportMessage('Пользовательская основа убрана') }}>Убрать основу</button>}
        </div>
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
          <button type="button" className="chip" onClick={downloadProject}>Скачать проект</button>
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
