import { Minus, Plus } from 'lucide-react'

export function ScaleControls({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="board-scale" role="group" aria-label="Масштаб поля">
      <button
        className="icon-button"
        aria-label="Уменьшить масштаб"
        disabled={value <= 0.25}
        onClick={() => onChange(Math.max(0.25, value - 0.25))}
      >
        <Minus size={18} />
      </button>
      <button
        className="scale-value"
        aria-label={`Масштаб ${Math.round(value * 100)}%, сбросить до 100%`}
        onClick={() => onChange(1)}
        title="Сбросить до 100%"
      >
        {Math.round(value * 100)}%
      </button>
      <button
        className="icon-button"
        aria-label="Увеличить масштаб"
        disabled={value >= 2}
        onClick={() => onChange(Math.min(2, value + 0.25))}
      >
        <Plus size={18} />
      </button>
    </div>
  )
}
