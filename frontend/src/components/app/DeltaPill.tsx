/**
 * DeltaPill — inline colored badge for numeric deltas (change %).
 */
import { formatPercent } from '../../lib/formatters'

interface DeltaPillProps {
  value: number | null | undefined
  className?: string
}

export default function DeltaPill({ value, className = '' }: DeltaPillProps) {
  if (value == null) return <span className="delta-pill neutral">—</span>
  const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
  return (
    <span className={`delta-pill ${tone} ${className}`}>{formatPercent(value)}</span>
  )
}
