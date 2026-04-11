import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, Loader } from 'lucide-react'
import { api } from '../api/client'
import type { AiMessage } from '../api/types'

interface Props {
  open: boolean
  onClose: () => void
  context?: Record<string, unknown>
}

const SUGGESTIONS = [
  'What stocks have RSI below 30?',
  'Explain the MACD indicator',
  'Which sectors are outperforming?',
  'How do I read the tech score?',
]

export default function AiPanel({ open, onClose, context }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: AiMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await api.chat({
        messages: newMessages,
        context: context ?? {},
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className={`ai-panel${open ? '' : ' collapsed'}`}>
      <div className="ai-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bot size={12} style={{ color: 'var(--orange)' }} />
          <span className="ai-title">AI Assistant</span>
        </div>
        <button className="term-btn" onClick={onClose} style={{ padding: '2px 4px' }}>
          <X size={11} />
        </button>
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
              Ask about market data, strategies, or analysis.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="term-btn"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="ai-msg-role">{m.role === 'user' ? 'YOU' : 'AI'}</div>
            <div className="ai-msg-content selectable">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg assistant">
            <div className="ai-msg-role">AI</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 'var(--text-xs)' }}>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything… (Enter to send)"
          rows={1}
        />
        <button
          className="term-btn primary"
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{ padding: '4px 8px', alignSelf: 'flex-end' }}
        >
          <Send size={11} />
        </button>
      </div>
    </div>
  )
}
