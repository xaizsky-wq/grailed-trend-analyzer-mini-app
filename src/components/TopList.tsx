import { useState } from 'react'
import { fetchModelItems } from '../api'
import type { PeriodType, Season, SoldListing, TrendItem, TrendsResponse } from '../api'

type QueryContext = {
  category_id: string
  period_type: PeriodType
  season?: Season
  date?: string
  min_price?: number
  max_price?: number
}

type Props = {
  items: TrendItem[]
  loading: boolean
  error: string | null
  message?: string
  stale?: boolean
  analysis?: TrendsResponse['analysis']
  queryContext: QueryContext
}

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(d)
}

export function TopList({ items, loading, error, message, stale, analysis, queryContext }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [listingsByKey, setListingsByKey] = useState<Record<string, SoldListing[]>>({})
  const [totalByKey, setTotalByKey] = useState<Record<string, number>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const toggle = async (item: TrendItem) => {
    const key = item.model_key
    if (openKey === key) {
      setOpenKey(null)
      return
    }
    setOpenKey(key)
    setListError(null)
    if (listingsByKey[key]) return
    setLoadingKey(key)
    try {
      const res = await fetchModelItems({ ...queryContext, model_key: key })
      setListingsByKey((prev) => ({ ...prev, [key]: res.items }))
      setTotalByKey((prev) => ({ ...prev, [key]: res.total_sold }))
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Ошибка загрузки списка лотов')
    } finally {
      setLoadingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="state">
        <div className="pulse" />
        <p>Читаем продажи за период, группируем по моделям и считаем, какие продаются чаще всего…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="state error">
        <p>Не удалось получить тренды.</p>
        <p className="muted">{error}</p>
      </div>
    )
  }
  if (message && items.length === 0) {
    return (
      <div className="state">
        <p>{message}</p>
        <p className="muted">Выберите 30 дней, другой диапазон цен или нажмите «Обновить данные».</p>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="state">
        <p>За этот период нет продаж моделей в категории.</p>
      </div>
    )
  }

  return (
    <div className="toplist">
      {analysis && analysis.sold_sample > 0 && (
        <p className="analysis">
          Проанализировано {analysis.sold_sample.toLocaleString('ru-RU')} продаж
          {analysis.ranked_by === 'sales_in_period_and_price_band' ? ' в выбранном диапазоне цен' : ''} →{' '}
          {analysis.models_found} моделей с повторными сделками → ТОП по числу продаж за период.
        </p>
      )}
      {stale && (
        <p className="banner">
          Последний скрапинг не вернул лоты — показываем сохранённый кэш.
        </p>
      )}
      <ol>
        {items.map((item) => {
          const sellers = item.seller_count ?? 0
          const isOpen = openKey === item.model_key
          const listings = listingsByKey[item.model_key]
          const total = totalByKey[item.model_key]
          const isLoadingList = loadingKey === item.model_key
          return (
            <li key={`${item.rank}-${item.model_key}`}>
              <article className="row">
                <span className="rank">{String(item.rank).padStart(2, '0')}</span>
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="thumb" />
                ) : (
                  <div className="thumb placeholder" />
                )}
                <div className="meta">
                  <p className="brand">{item.brand || '—'}</p>
                  <h3>{item.title}</h3>
                  <p className="stats">
                    <span>средняя {money(item.avg_price)}</span>
                      <span>
                      {item.sales_last_30d.toLocaleString("ru-RU")} продаж за период
                      {sellers > 0 ? ` · ${sellers} продавцов в выборке` : ''}
                    </span>
                  </p>
                </div>
                <div className="score">
                  <span className="score-label">продаж</span>
                  <strong>{item.sales_last_30d.toLocaleString("ru-RU")}</strong>
                  <div className="bar" aria-hidden>
                    <i style={{ width: `${Math.max(6, Math.min(100, item.trend_score * 100))}%` }} />
                  </div>
                  <button type="button" className="open-toggle" onClick={() => void toggle(item)}>
                    {isOpen ? 'Свернуть ▲' : 'Открыть список ▾'}
                  </button>
                  <a href={item.grailed_url} target="_blank" rel="noreferrer">
                    Все лоты на Grailed ↗
                  </a>
                </div>
              </article>

              {isOpen && (
                <div className="sold-panel">
                  {isLoadingList && <p className="muted">Загружаем проданные лоты…</p>}
                  {!isLoadingList && listError && <p className="muted error-text">{listError}</p>}
                  {!isLoadingList && !listError && listings && listings.length === 0 && (
                    <p className="muted">По этой модели за период не нашлось отдельных лотов.</p>
                  )}
                  {!isLoadingList && !listError && listings && listings.length > 0 && (
                    <>
                      <p className="sold-panel-caption">
                        Показано {listings.length} из {total ?? listings.length} проданных лотов — модель, цвет и цена по каждому.
                      </p>
                      <ul className="sold-items">
                        {listings.map((row) => (
                          <li key={row.id} className="sold-item">
                            {row.image_url ? (
                              <img src={row.image_url} alt="" className="thumb small" />
                            ) : (
                              <div className="thumb small placeholder" />
                            )}
                            <div className="sold-item-meta">
                              <p className="sold-item-title">{row.title}</p>
                              <p className="sold-item-sub">
                                {row.color && <span className="color-chip">{row.color}</span>}
                                <span>{money(row.price)}</span>
                                {row.seller && <span>@{row.seller}</span>}
                                {formatDate(row.sold_at) && <span>продано {formatDate(row.sold_at)}</span>}
                              </p>
                            </div>
                            <a href={row.grailed_url} target="_blank" rel="noreferrer" className="sold-item-link">
                              Лот ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
