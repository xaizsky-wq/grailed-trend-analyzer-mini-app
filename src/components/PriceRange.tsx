type Props = {
  minPrice: string
  maxPrice: string
  onMin: (v: string) => void
  onMax: (v: string) => void
}

const PRESETS: { label: string; min: string; max: string }[] = [
  { label: 'Любая', min: '', max: '' },
  { label: 'до $100', min: '', max: '100' },
  { label: '$100–300', min: '100', max: '300' },
  { label: '$300–700', min: '300', max: '700' },
  { label: 'от $700', min: '700', max: '' },
]

export function PriceRange({ minPrice, maxPrice, onMin, onMax }: Props) {
  const activePreset = PRESETS.find((p) => p.min === minPrice && p.max === maxPrice)?.label

  return (
    <div className="control-block period-block">
      <p className="field-label">Цена продажи</p>
      <p className="field-help">
        Новый поиск проданных лотов в этом диапазоне USD — не фильтр уже найденного топа
      </p>
      <div className="picker">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={activePreset === p.label ? 'chip active' : 'chip'}
            onClick={() => {
              onMin(p.min)
              onMax(p.max)
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="price-row">
        <label className="price-field">
          от
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="мин"
            value={minPrice}
            onChange={(e) => onMin(e.target.value)}
          />
        </label>
        <span className="price-sep">—</span>
        <label className="price-field">
          до
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="макс"
            value={maxPrice}
            onChange={(e) => onMax(e.target.value)}
          />
        </label>
        <span className="muted">USD</span>
      </div>
    </div>
  )
}
