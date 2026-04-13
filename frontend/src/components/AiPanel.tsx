import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useChatMutation } from '../api/query'
import type { AiMessage } from '../api/types'
import { useTerminalStore } from '../state/terminalStore'

interface Props {
  open: boolean
  onClose: () => void
}

function contextLabel(context: Record<string, unknown>) {
  const page = typeof context.page === 'string' ? context.page.toUpperCase() : 'GLOBAL'
  const ticker = typeof context.ticker === 'string' ? context.ticker.toUpperCase() : ''
  return ticker ? `${page} ${ticker}` : page
}

function promptSuggestions(context: Record<string, unknown>) {
  const ticker = typeof context.ticker === 'string' ? context.ticker.toUpperCase() : undefined
  const page = typeof context.page === 'string' ? context.page : undefined

  if (page === 'security' && ticker) {
    return [
      `Summarize ${ticker}'s technical posture in operator terms.`,
      `Compare ${ticker} to ${Array.isArray(context.compareTickers) ? (context.compareTickers as string[]).slice(0, 3).join(', ') : 'SPY'}.`,
      `Turn ${ticker}'s signal stack into a trading checklist.`,
    ]
  }

  if (page === 'screener') {
    return [
      'Explain what this screen is actually selecting for.',
      'Suggest one stricter and one looser version of this screen.',
      'Rank the current matches by quality and explain why.',
    ]
  }

  if (page === 'backtest') {
    return [
      'Interpret this backtest like a PM review.',
      'Explain the cost drag and what parameter matters most.',
      'Give two realistic improvements without curve-fitting.',
    ]
  }

  return [
    'Summarize the market pulse from this workspace.',
    'What should I look at next?',
    'Explain the highest-signal names on screen.',
  ]
}

export default function AiPanel({ open, onClose }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { aiContext, aiDraft, mergeAiContext } = useTerminalStore(useShallow((state) => ({
    aiContext: state.aiContext,
    aiDraft: state.aiDraft,
    mergeAiContext: state.mergeAiContext,
  })))
  const chat = useChatMutation()
  const suggestions = promptSuggestions(aiContext)

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, chat.isPending])

  useEffect(() => {
    if (open && aiDraft) {
      setInput(aiDraft)
      mergeAiContext({ lastPromptSeed: aiDraft })
    }
  }, [aiDraft, mergeAiContext, open])

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || chat.isPending) return

    const nextMessages = [...messages, { role: 'user', content: trimmed } as const]
    setMessages(nextMessages)
    setInput('')

    try {
      const response = await chat.mutateAsync({
        messages: nextMessages,
        context: aiContext,
      })
      setMessages((current) => [...current, { role: 'assistant', content: response.content }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error instanceof Error ? error.message : 'AI request failed.' },
      ])
    }
  }

  return (
    <aside className={`ai-drawer${open ? ' is-open' : ''}`}>
      <div className="drawer-header">
        <div className="drawer-title">
          <Bot size={13} />
          <span>AI ANALYST</span>
          <span className="drawer-context">{contextLabel(aiContext)}</span>
        </div>
        <button type="button" className="terminal-icon-button" onClick={onClose}>
          <X size={12} />
        </button>
      </div>

      <div className="drawer-body" ref={scrollRef}>
        {messages.length === 0 && !chat.isPending ? (
          <div className="empty-block">
            <div className="empty-title">Integrated analyst is idle.</div>
            <div className="empty-copy">
              Use it for market context, strategy critique, or single-name analysis without leaving the workspace.
            </div>
            <div className="saved-inline-list">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="saved-inline-button" onClick={() => void submit(suggestion)}>
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
              <div className="chat-role">{message.role === 'user' ? 'YOU' : 'AI'}</div>
              <div className="chat-content selectable">{message.content}</div>
            </div>
          ))
        )}

        {chat.isPending && (
          <div className="chat-message assistant">
            <div className="chat-role">AI</div>
            <div className="chat-content selectable">Processing terminal context…</div>
          </div>
        )}
      </div>

      <div className="drawer-input">
        <textarea
          ref={inputRef}
          className="terminal-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit(input)
            }
          }}
          rows={3}
          placeholder="Ask about the active workspace..."
        />
        <button type="button" className="terminal-button" onClick={() => void submit(input)} disabled={!input.trim()}>
          <Send size={12} />
          SEND
        </button>
      </div>
    </aside>
  )
}
