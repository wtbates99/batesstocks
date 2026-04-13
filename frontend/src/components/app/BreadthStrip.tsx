/**
 * BreadthStrip — compact horizontal strip of market breadth stats.
 * Renders advancers/decliners/above-200D/avg-RSI in a single line.
 */
import type { TerminalStat } from '../../api/types'

const TONE_CLASS: Record<string, string> = {
  positive: 'tone-positive',
  negative: 'tone-negative',
  warning: 'tone-warning',
  neutral: '',
  cyan: 'tone-cyan',
}

interface BreadthStripProps {
  stats: TerminalStat[]
  universeSize?: number
  className?: string
}

export default function BreadthStrip({ stats, universeSize, className = '' }: BreadthStripProps) {
  return (
    <div className={`breadth-strip ${className}`}>
      {universeSize != null && (
        <div className="breadth-item">
          <span className="breadth-key">UNIVERSE</span>
          <span className="breadth-val">{universeSize}</span>
        </div>
      )}
      {stats.map((stat) => (
        <div key={stat.label} className="breadth-item">
          <span className="breadth-key">{stat.label}</span>
          <span className={`breadth-val ${TONE_CLASS[stat.tone] ?? ''}`}>
            {stat.value}
            {stat.change && <span style={{ marginLeft: 4, fontWeight: 400, opacity: 0.7 }}>{stat.change}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
