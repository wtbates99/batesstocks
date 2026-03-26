import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import SearchBar from '../components/SearchBar';
import '../styles.css';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [daysAhead, setDaysAhead] = useState(14);

  useEffect(() => {
    setLoading(true);
    fetch(`/earnings?days_ahead=${daysAhead}`)
      .then(r => r.json())
      .then(d => { setEvents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [daysAhead]);

  // Group by date
  const grouped = events.reduce((acc, e) => {
    (acc[e.earnings_date] = acc[e.earnings_date] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="bg-dark">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
        <div className="header-controls"><SearchBar /></div>
      </header>

      <div className="page-body">
        <div className="page-header-row">
          <h2 className="page-section-title">EARNINGS CALENDAR</h2>
          <div className="day-toggle">
            {[7, 14, 30, 60].map(d => (
              <button key={d} className={`toolbar-btn ${daysAhead===d?'active':''}`} onClick={() => setDaysAhead(d)}>
                {d}D
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="cp-loading"><span className="cp-loading-label">Loading earnings…</span></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="cp-loading"><span className="cp-loading-label">No upcoming earnings found.</span></div>
        ) : (
          <div className="calendar-table-wrap">
            <table className="screener-table">
              <thead>
                <tr>
                  <th>DATE</th><th>TICKER</th><th>COMPANY</th>
                  <th className="num-col">EPS EST</th><th className="num-col">EPS ACT</th><th className="num-col">SURPRISE</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([date, evts]) => (
                  <React.Fragment key={date}>
                    <tr className="calendar-date-row">
                      <td colSpan={6}>{date}</td>
                    </tr>
                    {evts.map((e, i) => (
                      <tr key={i}>
                        <td></td>
                        <td><Link to={`/spotlight/${e.ticker}`} className="screener-ticker-link">{e.ticker}</Link></td>
                        <td className="company-name-cell">{e.company_name || '—'}</td>
                        <td className="num-col">{e.eps_estimate != null ? e.eps_estimate.toFixed(2) : '—'}</td>
                        <td className="num-col">{e.eps_actual != null ? e.eps_actual.toFixed(2) : '—'}</td>
                        <td className="num-col" style={{ color: e.surprise_pct == null ? 'var(--dim)' : e.surprise_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {e.surprise_pct != null ? `${e.surprise_pct > 0 ? '+' : ''}${e.surprise_pct.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarPage;
