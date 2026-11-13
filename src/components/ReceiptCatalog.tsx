import { useMemo, useState } from 'react'
import { receiptTemplates, type ReceiptTemplate } from '../receiptCatalog'

const kindLabel = { a4: 'A4', thermal: 'Термальный', email: 'Email' }

export function ReceiptCatalog() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ReceiptTemplate['kind']>('all')
  const [selected, setSelected] = useState<ReceiptTemplate | null>(null)
  const filtered = useMemo(() => receiptTemplates.filter(template => (kind === 'all' || template.kind === kind) && `${template.brand} ${template.name}`.toLowerCase().includes(query.trim().toLowerCase())), [kind, query])

  return <section className="receipt-catalog">
    <div className="photo-heading receipt-heading"><div><p className="eyebrow">FIXED TEMPLATE LIBRARY</p><h2>Каталог макетов</h2></div><p>{receiptTemplates.length} файлов из VAZHNYY NEW. Пользовательские загрузки отключены.</p></div>
    <div className="receipt-toolbar">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти бренд или шаблон" aria-label="Поиск шаблона"/>
      <div className="picker">{(['all', 'a4', 'thermal', 'email'] as const).map(value => <button type="button" key={value} className={kind === value ? 'chip active' : 'chip'} onClick={() => setKind(value)}>{value === 'all' ? 'Все' : kindLabel[value]}</button>)}</div>
    </div>
    <p className="receipt-count">Найдено: {filtered.length}</p>
    <div className="receipt-grid">{filtered.map(template => <button type="button" key={template.id} className={selected?.id === template.id ? 'receipt-card active' : 'receipt-card'} onClick={() => setSelected(template)}>
      <span className={`receipt-icon ${template.kind}`}>{template.kind === 'email' ? '✉' : template.kind === 'thermal' ? '▥' : 'A4'}</span>
      <span><small>{kindLabel[template.kind]}</small><strong>{template.brand}</strong><em>{template.name}</em></span>
    </button>)}</div>
    {selected && <div className="receipt-source-viewer">
      <div className="receipt-source-head"><div><small>{kindLabel[selected.kind]} · исходный файл</small><strong>{selected.name}</strong></div><div><a className="primary" href={`/api/receipts/${selected.id}`} download>Скачать оригинал</a><button type="button" className="chip" onClick={() => setSelected(null)}>Закрыть</button></div></div>
      <iframe key={selected.id} src={`/api/receipts/${selected.id}?mode=inline`} title={`Просмотр ${selected.name}`} sandbox="allow-same-origin"/>
    </div>}
  </section>
}
