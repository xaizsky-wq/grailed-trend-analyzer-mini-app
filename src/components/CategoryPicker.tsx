import type { Category } from '../api'

type Props = {
  categories: Category[]
  selected: string
  onChange: (id: string) => void
}

export function CategoryPicker({ categories, selected, onChange }: Props) {
  return (
    <div className="control-block">
      <p className="field-label">Категория</p>
      <div className="picker" role="tablist" aria-label="Категория">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selected === cat.id}
            className={selected === cat.id ? 'chip active' : 'chip'}
            onClick={() => onChange(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}
