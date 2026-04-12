import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, Loader, Zap } from 'lucide-react'
import { api } from '../api/client'
import type { AiMessage } from '../api/types'

interface Props {
  open: boolean
  onClose: () => void
  context?: Record<string, unknown>
  /** If set, panel auto-sends this message when opened */
  prefill?: string
}

// Quick-action suggestions vary by page context
function getSuggestions(ctx: Record<string, unknown>): string[] {
  const ticker = ctx.ticker as string | undefined
  const page   = ctx.page   as string | undefined

  if (ticker && page === 'security') {
    return [
      `Analyze ${ticker} technically — is it a buy or sell?`,
      `What is the current trend for ${ticker}?`,
      `Is ${ticker} overbought or oversold?`,
      `What are key support and resistance levels for ${ticker}?`,
    ]
  }
  if (page === 'backtest') {
    const strat = ctx.strategy as string | undefined
    return [
      strat ? `Explain these backtest results for ${strat}` : 'Explain these backtest results',
      'How can I improve this strategy?',
      'What are the risks of this approach?',
      'Compare this to a buy-and-hold strategy',
    ]
  }
  if (page === 'screener') {
    return [
      'Which screener results look most promising?',
      'What do these technical scores mean?',
      'Which sectors are showing strength?',
      'Explain what RSI below 30 means for trading',
    ]
  }
  return [
    'What stocks have RSI below 30?',
    'Which sectors are outperforming this week?',
    'Explain the MACD indicator',
    'What is a good entry strategy for trending stocks?',
  ]
}

export default function AiPanel({ open, onClose, context = {}, prefill }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const prefillSent = useRef<string | undefined>(undefined)

  // Auto-focus when opened
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // Auto-send prefill message when panel opens with a new prefill
  useEffect(() => {
    if (open && prefill && prefill !== prefillSent.current) {
      prefillSent.current = prefill
      sendMessage(prefill)
    }
  }, [open, prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset prefill tracker when panel closes
  useEffect(() => {
    if (!open) prefillSent.current = undefined
  }, [open])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: AiMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await api.chat({
        messages: newMessages,
        context,
      })
      setMessages(m => [...m, { role: 'assistant', content: res.content }])
    } catch (e) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : 'Request failed'}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const suggestions = getSuggestions(context)

  // Build a readable context summary for the panel header
  const ctxLabel = (() => {
    const ticker = context.ticker as string | undefined
    const page   = (context.page as string | undefined)?.toUpperCase()
    if (ticker && page) return `${page} · ${ticker}`
    if (page) return page
    return 'GLOBAL'
  })()

  return (
    <div className={`ai-panel${open ? '' : ' collapsed'}`}>
      {/* Header */}
      <div className="ai-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bot size={12} style={{ color: 'var(--orange)' }} />
          <span className="ai-title">AI ANALYST</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', paddingLeft: 4, borderLeft: '1px solid var(--border)' }}>
            {ctxLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {messages.length > 0 && (
            <button
              className="term-btn"
              style={{ padding: '2px 6px', fontSize: 'var(--text-xs)' }}
              onClick={() => setMessages([])}
            >
              Clear
            </button>
          )}
          <button className="term-btn" onClick={onClose} style={{ padding: '2px 4px' }}>
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && !loading && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
              Ask about market data, strategies, or technical analysis.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  className="term-btn"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: 'var(--text-xs)', padding: '3px 6px' }}
                  onClick={() => sendMessage(s)}
                >
                  <Zap size={9} style={{ flexShrink: 0, color: 'var(--orange)' }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="ai-msg-role">{m.role === 'user' ? 'YOU' : 'AI'}</div>
            <div
              className="ai-msg-content selectable"
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg assistant">
            <div className="ai-msg-role">AI</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 'var(--text-xs)' }}>Analysing…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          rows={1}
        />
        <button
          className="term-btn primary"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{ padding: '4px 8px', alignSelf: 'flex-end' }}
        >
          <Send size={11} />
        </button>
      </div>
    </div>
  )
}
