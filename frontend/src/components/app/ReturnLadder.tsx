/**
 * ReturnLadder — shows 1D / 20D / 63D / 252D return columns in a compact horizontal strip.
 */
import { formatPercent } from '../../lib/formatters'

export interface ReturnLadderProps {
  change1d?: number | null
  return20d?: number | null
  return63d?: number | null
  return126d?: number | null
  return252d?: number | null
  className?: string
}

interface Rung {
  label: string
  value: number | null | undefined
}

function toneClass(v: number | null | undefined) {
  if (v == null) return ''
  return v >= 0 ? 'tone-positive' : 'tone-negative'
}

export default function ReturnLadder({
  change1d,
  return20d,
  return63d,
  return126d,
  return252d,
  className = '',
}: ReturnLadderProps) {
  const rungs: Rung[] = [
    { label: '1D', value: change1d },
    { label: '20D', value: return20d },
    { label: '63D', value: return63d },
  ]
  if (return126d != null) rungs.push({ label: '126D', value: return126d })
  if (return252d != null) rungs.push({ label: '252D', value: return252d })

  return (
    <div className={`return-ladder ${className}`} style={{ gridTemplateColumns: `repeat(${rungs.length}, minmax(0, 1fr))` }}>
      {rungs.map(({ label, value }) => (
        <div key={label} className="return-rung">
          <div className="return-period">{label}</div>
          <div className={`return-value ${toneClass(value)}`}>{formatPercent(value)}</div>
        </div>
      ))}
    </div>
  )
}
