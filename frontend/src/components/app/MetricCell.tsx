/**
 * MetricCell — compact key/value display used in quote strips, stat grids, and headers.
 *
 * Usage:
 *   <MetricCell label="RSI" value="63.4" tone="positive" />
 *   <MetricCell label="Vol" value="12.4M" sub="+2.1x avg" />
 */
export interface MetricCellProps {
  label: string
  value: string | null | undefined
  sub?: string | null
  tone?: 'positive' | 'negative' | 'warning' | 'neutral' | 'cyan'
  size?: 'default' | 'lg' | 'xl'
  className?: string
}

const TONE_CLASS: Record<string, string> = {
  positive: 'tone-positive',
  negative: 'tone-negative',
  warning: 'tone-warning',
  neutral: '',
  cyan: 'tone-cyan',
}

const SIZE_CLASS: Record<string, string> = {
  default: '',
  lg: 'lg',
  xl: 'xl',
}

export default function MetricCell({
  label,
  value,
  sub,
  tone = 'neutral',
  size = 'default',
  className = '',
}: MetricCellProps) {
  return (
    <div className={`metric-cell ${className}`}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}>
        {value ?? '—'}
      </div>
      {sub != null && <div className="metric-change">{sub}</div>}
    </div>
  )
}
