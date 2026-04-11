import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { HeatmapNode } from '../api/types'

function pctColor(pct: number | null | undefined): string {
  if (pct == null) return '#1c2128'
  const v = Math.max(-8, Math.min(8, pct))
  if (v >= 0) {
    const t = v / 8
    const r = Math.round(14 + (63 - 14) * t)
    const g = Math.round(36 + (185 - 36) * t)
    const b = Math.round(18 + (80 - 18) * t)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (-v) / 8
    const r = Math.round(14 + (248 - 14) * t)
    const g = Math.round(36 + (81 - 36) * t)
    const b = Math.round(18 + (73 - 18) * t)
    return `rgb(${r},${g},${b})`
  }
}

interface CellProps {
  node: HeatmapNode
  size: number
  onClick: () => void
}

function HeatCell({ node, size, onClick }: CellProps) {
  const bg = pctColor(node.pct_change)
  const pct = node.pct_change
  const isLight = (pct != null && Math.abs(pct) > 3)
  const textColor = isLight ? '#fff' : 'rgba(255,255,255,0.7)'

  const fontSize = size > 80 ? 11 : size > 50 ? 9 : 8
  const pctSize = size > 80 ? 10 : 8

  return (
    <div
      className="heatmap-cell"
      style={{ background: bg, width: size, height: size, cursor: 'pointer' }}
      onClick={onClick}
      title={`${node.name}: ${pct != null ? pct.toFixed(2) + '%' : '—'}`}
    >
      {size > 30 && (
        <>
          <span className="heatmap-ticker" style={{ fontSize, color: textColor }}>
            {node.ticker ?? node.name.slice(0, 10)}
          </span>
          {size > 44 && (
            <span className="heatmap-pct" style={{ fontSize: pctSize, color: textColor, opacity: 0.85 }}>
              {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : ''}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function Legend() {
  const steps = [-8, -4, -2, -1, 0, 1, 2, 4, 8]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      <span>-8%</span>
      {steps.map(s => (
        <div key={s} style={{ width: 18, height: 10, background: pctColor(s), borderRadius: 2 }} />
      ))}
      <span>+8%</span>
    </div>
  )
}

export default function HeatmapPage() {
  const navigate = useNavigate()
  const [level, setLevel] = useState<'sector' | 'subsector' | 'stock'>('sector')
  const [sector, setSector] = useState<string | null>(null)
  const [subsector, setSubsector] = useState<string | null>(null)

  const { data, loading } = useApi(
    () => api.heatmap(level, sector ?? undefined, subsector ?? undefined),
    [level, sector, subsector],
  )

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
  }, [data])

  const totalCap = useMemo(
    () => sorted.reduce((s, n) => s + (n.market_cap ?? 0), 0),
    [sorted],
  )

  const handleClick = (node: HeatmapNode) => {
    if (level === 'sector') {
      setSector(node.name)
      setLevel('subsector')
    } else if (level === 'subsector') {
      setSubsector(node.name)
      setLevel('stock')
    } else if (node.ticker) {
      navigate(`/spotlight/${node.ticker}`)
    }
  }

  const goBack = () => {
    if (level === 'stock') { setLevel('subsector'); setSubsector(null) }
    else if (level === 'subsector') { setLevel('sector'); setSector(null) }
  }

  const breadcrumb = [
    { label: 'Sectors', active: level === 'sector' },
    ...(sector ? [{ label: sector, active: level === 'subsector' }] : []),
    ...(subsector ? [{ label: subsector, active: level === 'stock' }] : []),
  ]

  // Compute cell sizes proportional to market cap, within a 900×500 area
  const AREA = 850 * 480
  const cells = useMemo(() => {
    if (!sorted.length) return []
    const minCap = Math.min(...sorted.map(n => n.market_cap ?? 0).filter(v => v > 0))
    const maxCap = Math.max(...sorted.map(n => n.market_cap ?? 0))
    return sorted.map(n => {
      const cap = n.market_cap ?? minCap
      const ratio = totalCap > 0 ? cap / totalCap : 1 / sorted.length
      const area = ratio * AREA
      const size = Math.max(28, Math.min(160, Math.sqrt(area)))
      return { node: n, size }
    })
  }, [sorted, totalCap])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {level !== 'sector' && (
          <button className="term-btn" onClick={goBack}>
            <ChevronLeft size={12} /> Back
          </button>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {breadcrumb.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: 'var(--text-muted)' }}>›</span>}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: b.active ? 'var(--orange)' : 'var(--text-muted)',
              }}>
                {b.label}
              </span>
            </span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Legend />
        </div>
      </div>

      {/* Heatmap */}
      <div className="panel" style={{ flex: 1 }}>
        <div className="panel-body" style={{ overflow: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
              <div className="spinner" />
            </div>
          ) : (
            <div className="heatmap-grid">
              {cells.map(({ node, size }, i) => (
                <HeatCell key={i} node={node} size={size} onClick={() => handleClick(node)} />
              ))}
              {cells.length === 0 && <div className="empty-state">No data</div>}
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 8px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flexWrap: 'wrap' }}>
        {sorted.slice(0, 8).map(n => (
          <div key={n.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {n.ticker ?? n.name.slice(0, 12)}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: (n.pct_change ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
            }}>
              {n.pct_change != null ? `${n.pct_change >= 0 ? '+' : ''}${n.pct_change.toFixed(2)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
