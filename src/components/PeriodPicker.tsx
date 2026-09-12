import type { PeriodType, Season } from '../api'

type Props = {
  periodType: PeriodType
  season: Season
  date: string
  onPeriodType: (v: PeriodType) => void
  onSeason: (v: Season) => void
  onDate: (v: string) => void
}

const WINDOWS: { id: PeriodType; label: string; hint: string }[] = [
  { id: 'current', label: '24 часа', hint: 'сегодня' },
  { id: 'days_7', label: '7 дней', hint: 'неделя' },
  { id: 'days_30', label: '30 дней', hint: 'месяц' },
  { id: 'days_90', label: '90 дней', hint: 'квартал' },
  { id: 'season', label: 'Сезон', hint: 'весна–зима' },
  { id: 'custom_date', label: 'Дата', hint: 'один день' },
]

const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Весна' },
  { id: 'summer', label: 'Лето' },
  { id: 'autumn', label: 'Осень' },
  { id: 'winter', label: 'Зима' },
]

export function PeriodPicker({
  periodType,
  season,
  date,
  onPeriodType,
  onSeason,
  onDate,
}: Props) {
  return (
    <div className="control-block period-block">
      <p className="field-label">Период продаж</p>
      <p className="field-help">За какой срок считать все продажи одной модели у разных продавцов</p>
      <div className="picker period-pills" role="radiogroup" aria-label="Период продаж">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={periodType === w.id}
            className={periodType === w.id ? 'chip time active' : 'chip time'}
            onClick={() => onPeriodType(w.id)}
          >
            <span className="chip-main">{w.label}</span>
            <span className="chip-hint">{w.hint}</span>
          </button>
        ))}
      </div>
      {periodType === 'season' && (
        <div className="picker wrap">
          {SEASONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={season === s.id ? 'chip active' : 'chip'}
              onClick={() => onSeason(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {periodType === 'custom_date' && (
        <label className="date-field">
          День
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
        </label>
      )}
    </div>
  )
}
