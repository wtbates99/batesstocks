import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { EarningsEvent } from '../api/types'

function fmt(n: number | null | undefined, dec = 2) {
  return n != null ? n.toFixed(dec) : '—'
}

function groupByDate(events: EarningsEvent[]) {
  const map: Record<string, EarningsEvent[]> = {}
  for (const e of events) {
    const d = e.earnings_date.slice(0, 10)
    if (!map[d]) map[d] = []
    map[d].push(e)
  }
  return map
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [days, setDays] = useState(14)
  const { data, loading } = useApi(() => api.calendar.earnings(days), [days])

  const grouped = data ? groupByDate(data) : {}
  const dates = Object.keys(grouped).sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Calendar size={14} style={{ color: 'var(--orange)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          Earnings Calendar
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              className={`term-btn${days === d ? ' primary' : ''}`}
              style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
              onClick={() => setDays(d)}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <div className="spinner" />
            </div>
          </div>
        ) : dates.length === 0 ? (
          <div className="empty-state">No earnings events in this period</div>
        ) : (
          dates.map(date => {
            const events = grouped[date]
            const d = new Date(date + 'T00:00:00')
            const isToday = date === new Date().toISOString().slice(0, 10)
            return (
              <div key={date} className="panel">
                <div className="panel-header" style={{ background: isToday ? 'var(--orange-bg)' : undefined }}>
                  <span className="panel-title" style={{ color: isToday ? 'var(--orange)' : undefined }}>
                    {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {isToday && <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', background: 'var(--orange)', color: '#000', padding: '1px 4px', borderRadius: 2 }}>TODAY</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {events.length} reports
                  </span>
                </div>
                <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Company</th>
                        <th style={{ textAlign: 'right' }}>EPS Est.</th>
                        <th style={{ textAlign: 'right' }}>EPS Actual</th>
                        <th style={{ textAlign: 'right' }}>Surprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e, i) => (
                        <tr key={i}>
                          <td className="col-ticker" onClick={() => navigate(`/spotlight/${e.ticker}`)}>
                            {e.ticker}
                          </td>
                          <td className="col-name">{e.company_name ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(e.eps_estimate)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {e.eps_actual != null ? (
                              <span className={e.eps_actual >= (e.eps_estimate ?? 0) ? 'up' : 'down'}>
                                {fmt(e.eps_actual)}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {e.surprise_pct != null ? (
                              <span className={e.surprise_pct >= 0 ? 'up' : 'down'}>
                                {e.surprise_pct >= 0 ? '+' : ''}{e.surprise_pct.toFixed(2)}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
