/**
 * SignalStack — renders a vertical list of labelled signal rows.
 * Used in the security page side rail and compare detail.
 */
import type { SecuritySignal } from '../../api/types'

interface SignalStackProps {
  signals: SecuritySignal[]
  className?: string
}

const TONE_CLASS: Record<string, string> = {
  positive: 'tone-positive',
  negative: 'tone-negative',
  warning: 'tone-warning',
  neutral: '',
  cyan: 'tone-cyan',
}

export default function SignalStack({ signals, className = '' }: SignalStackProps) {
  if (signals.length === 0) return null
  return (
    <div className={`signal-stack ${className}`}>
      {signals.map((sig) => (
        <div key={sig.label} className="signal-item">
          <span className="signal-label">{sig.label}</span>
          <span className={`signal-value ${TONE_CLASS[sig.tone] ?? ''}`}>{sig.value}</span>
        </div>
      ))}
    </div>
  )
}
