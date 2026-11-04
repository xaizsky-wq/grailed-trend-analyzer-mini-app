import { useCallback, useEffect, useState } from 'react'
import { CategoryPicker } from './components/CategoryPicker'
import { PeriodPicker } from './components/PeriodPicker'
import { PriceRange } from './components/PriceRange'
import { TopList } from './components/TopList'
import { PhotoSearch } from './components/PhotoSearch'
import { PhotoUnique } from './components/PhotoUnique'
import { initTelegram, type TelegramUser } from './telegram'
import {
  fetchCategories,
  fetchTrends,
  type Category,
  type PeriodType,
  type Season,
  type TrendsResponse,
} from './api'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function App() {
  const [view, setView] = useState<'trends' | 'photo' | 'unique'>('trends')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('sneakers')
  const [periodType, setPeriodType] = useState<PeriodType>('days_30')
  const [season, setSeason] = useState<Season>('winter')
  const [date, setDate] = useState(todayIso())
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [data, setData] = useState<TrendsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [insideTelegram, setInsideTelegram] = useState(false)

  useEffect(() => {
    const telegram = initTelegram()
    setInsideTelegram(Boolean(telegram?.initData))
    setTelegramUser(telegram?.initDataUnsafe.user ?? null)
  }, [])

  useEffect(() => {
    fetchCategories()
      .then((list) => {
        setCategories(list)
      })
      .catch((err: Error) => setBootError(err.message))
  }, [])

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchTrends({
          category_id: categoryId,
          period_type: periodType,
          season: periodType === 'season' ? season : undefined,
          date: periodType === 'custom_date' ? date : undefined,
          min_price: minPrice === '' || Number.isNaN(Number(minPrice)) ? undefined : Number(minPrice),
          max_price: maxPrice === '' || Number.isNaN(Number(maxPrice)) ? undefined : Number(maxPrice),
          refresh,
        })
        setData(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка')
      } finally {
        setLoading(false)
      }
    },
    [categoryId, periodType, season, date, minPrice, maxPrice],
  )

  useEffect(() => {
    if (!categoryId) return
    void load(false)
  }, [load, categoryId])

  return (
    <div className="shell">
      <header className="mast">
        <p className="eyebrow">рынок · продажи · модели</p>
        <h1>Grailed Trend Analyzer</h1>
        <p className="lede">
          Анализ рынка: берём продажи категории за выбранный период и диапазон
          цен, группируем по модели и ранжируем по числу сделок. Одиночные лоты в
          топ не попадают.
        </p>
      </header>

      <section className="telegram-profile" aria-label="Telegram Mini App">
        <div className="telegram-user">
          {telegramUser?.photo_url ? <img src={telegramUser.photo_url} alt="" /> : <span className="telegram-avatar">{telegramUser?.first_name?.slice(0, 1).toUpperCase() || 'T'}</span>}
          <div><p className="eyebrow">TELEGRAM MINI APP</p><strong>{telegramUser ? `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ''}` : 'Гостевой режим'}</strong><small>{telegramUser?.username ? `@${telegramUser.username}` : insideTelegram ? `ID ${telegramUser?.id ?? ''}` : 'Откройте приложение через Telegram-бота'}</small></div>
        </div>
        <span className={insideTelegram ? 'telegram-state online' : 'telegram-state'}>{insideTelegram ? 'Подключено' : 'Предпросмотр'}</span>
      </section>

      <nav className="view-tabs" aria-label="Разделы анализатора">
        <button type="button" className={view === 'trends' ? 'view-tab active' : 'view-tab'} onClick={() => setView('trends')}>Тренды и продажи</button>
        <button type="button" className={view === 'photo' ? 'view-tab active' : 'view-tab'} onClick={() => setView('photo')}>Поиск по фото</button>
        <button type="button" className={view === 'unique' ? 'view-tab active' : 'view-tab'} onClick={() => setView('unique')}>Remover</button>
      </nav>

      {view === 'photo' ? <PhotoSearch /> : view === 'unique' ? <PhotoUnique /> : <>

      <section className="controls">
        {bootError && <p className="banner">{bootError}</p>}
        <CategoryPicker
          categories={categories}
          selected={categoryId}
          onChange={setCategoryId}
        />
        <PeriodPicker
          periodType={periodType}
          season={season}
          date={date}
          onPeriodType={setPeriodType}
          onSeason={setSeason}
          onDate={setDate}
        />
        <PriceRange
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMin={setMinPrice}
          onMax={setMaxPrice}
        />
        <div className="actions">
          <button type="button" className="primary" onClick={() => void load(true)} disabled={loading}>
            Обновить данные
          </button>
          <p className="hint">Обновляет выборку продаж для выбранных параметров.</p>
        </div>
      </section>

      <TopList
        items={data?.items ?? []}
        loading={loading}
        error={error}
        message={data?.message}
        stale={data?.stale}
        analysis={data?.analysis}
        queryContext={{
          category_id: categoryId,
          period_type: periodType,
          season: periodType === 'season' ? season : undefined,
          date: periodType === 'custom_date' ? date : undefined,
          min_price: minPrice === '' || Number.isNaN(Number(minPrice)) ? undefined : Number(minPrice),
          max_price: maxPrice === '' || Number.isNaN(Number(maxPrice)) ? undefined : Number(maxPrice),
        }}
      />
      </>}
    </div>
  )
}
