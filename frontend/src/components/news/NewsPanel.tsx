import type { NewsItem } from '../../api/types'
import { formatTimestamp } from '../../lib/formatters'

interface Props {
  title: string
  items: NewsItem[]
  empty: string
  loading?: boolean
  className?: string
}

export default function NewsPanel({ title, items, empty, loading, className }: Props) {
  return (
    <section className={`terminal-panel${className ? ` ${className}` : ''}`}>
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {loading && <div className="panel-meta" style={{ color: 'var(--cyan)' }}>LOADING…</div>}
        {!loading && items.length > 0 && <div className="panel-meta">{items.length} items</div>}
      </div>
      <div className="feed-list">
        {items.length === 0 ? (
          <div className="empty-block">
            <div className="empty-title">{loading ? 'Fetching news…' : 'No current news.'}</div>
            <div className="empty-copy">{loading ? 'Pulling latest headlines from market data feeds.' : empty}</div>
          </div>
        ) : (
          items.map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="feed-item"
            >
              <div className="feed-ticker">{item.ticker ?? 'NEWS'} · {item.publisher ?? 'WIRE'}</div>
              <div className="feed-headline">{item.title}</div>
              <div className="feed-detail">{item.summary ?? 'Open the article for the full context.'}</div>
              <div className="feed-meta">
                <span>{formatTimestamp(item.published_at)}</span>
                {item.related_tickers.length > 0 && (
                  <span>{item.related_tickers.slice(0, 4).join(' · ')}</span>
                )}
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  )
}
