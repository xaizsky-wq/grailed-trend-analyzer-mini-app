import { useMemo, useState } from 'react'
import { receiptTemplates, type ReceiptTemplate } from '../receiptCatalog'

type FormData = { item: string; sku: string; size: string; color: string; price: string; currency: string; date: string; reference: string }
const initial: FormData = { item: '', sku: '', size: '', color: '', price: '', currency: 'EUR', date: new Date().toISOString().slice(0, 10), reference: '' }
const kindLabel = { a4: 'A4', thermal: 'Термальный', email: 'Email' }

export function ReceiptCatalog() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ReceiptTemplate['kind']>('all')
  const [selected, setSelected] = useState<ReceiptTemplate | null>(null)
  const [data, setData] = useState<FormData>(initial)
  const filtered = useMemo(() => receiptTemplates.filter(template => (kind === 'all' || template.kind === kind) && `${template.brand} ${template.name}`.toLowerCase().includes(query.trim().toLowerCase())), [kind, query])
  const update = (key: keyof FormData, value: string) => setData(current => ({ ...current, [key]: value }))

  return <section className="receipt-catalog">
    <div className="photo-heading receipt-heading"><div><p className="eyebrow">FIXED TEMPLATE LIBRARY</p><h2>Каталог макетов</h2></div><p>{receiptTemplates.length} файлов из VAZHNYY NEW. Пользовательские загрузки отключены.</p></div>
    <div className="receipt-toolbar">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти бренд или шаблон" aria-label="Поиск шаблона"/>
      <div className="picker">{(['all', 'a4', 'thermal', 'email'] as const).map(value => <button type="button" key={value} className={kind === value ? 'chip active' : 'chip'} onClick={() => setKind(value)}>{value === 'all' ? 'Все' : kindLabel[value]}</button>)}</div>
    </div>
    <p className="receipt-count">Найдено: {filtered.length}</p>
    <div className="receipt-grid">{filtered.map(template => <button type="button" key={template.id} className={selected?.id === template.id ? 'receipt-card active' : 'receipt-card'} onClick={() => { setSelected(template); setData(initial) }}>
      <span className={`receipt-icon ${template.kind}`}>{template.kind === 'email' ? '✉' : template.kind === 'thermal' ? '▥' : 'A4'}</span>
      <span><small>{kindLabel[template.kind]}</small><strong>{template.brand}</strong><em>{template.name}</em></span>
    </button>)}</div>
    {selected && <div className="receipt-workspace">
      <form className="receipt-form" onSubmit={event => event.preventDefault()}>
        <div className="receipt-selected"><small>Выбранный макет</small><strong>{selected.name}</strong><button type="button" className="chip" onClick={() => setSelected(null)}>Закрыть</button></div>
        <label>Название вещи<input value={data.item} onChange={event => update('item', event.target.value)} placeholder="Название и модель"/></label>
        <label>Артикул / SKU<input value={data.sku} onChange={event => update('sku', event.target.value)}/></label>
        <label>Размер<input value={data.size} onChange={event => update('size', event.target.value)}/></label>
        <label>Цвет<input value={data.color} onChange={event => update('color', event.target.value)}/></label>
        <label>Стоимость<input type="number" min="0" step="0.01" value={data.price} onChange={event => update('price', event.target.value)}/></label>
        <label>Валюта<select value={data.currency} onChange={event => update('currency', event.target.value)}><option>EUR</option><option>USD</option><option>GBP</option><option>UAH</option></select></label>
        <label>Дата<input type="date" value={data.date} onChange={event => update('date', event.target.value)}/></label>
        <label>Референс<input value={data.reference} onChange={event => update('reference', event.target.value)}/></label>
      </form>
      <div className={`receipt-safe-preview ${selected.kind}`}>
        <div className="receipt-preview-head"><strong>{selected.brand}</strong><small>{kindLabel[selected.kind]} · DEMO</small></div>
        <h3>{data.item || 'Название вещи'}</h3><p>{data.sku || 'SKU'} · {data.size || 'SIZE'} · {data.color || 'COLOR'}</p>
        <dl><div><dt>DATE</dt><dd>{data.date}</dd></div><div><dt>REFERENCE</dt><dd>{data.reference || 'DEMO-0001'}</dd></div><div><dt>TOTAL</dt><dd>{Number(data.price || 0).toFixed(2)} {data.currency}</dd></div></dl>
        <div className="receipt-watermark">SAMPLE<br/><span>NOT VALID</span></div><footer>DEMONSTRATION DOCUMENT · NOT PROOF OF PURCHASE</footer>
      </div>
    </div>}
  </section>
}
