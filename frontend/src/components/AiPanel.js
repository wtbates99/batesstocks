import React, { useState, useRef, useEffect, useCallback } from 'react';

const DEFAULT_MODELS = {
  ollama:    'qwen3.5:cloud',
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o-mini',
};

const QUICK_PROMPTS = [
  'Which stocks show the strongest bullish signals?',
  'Identify the highest risk positions',
  'Where do you see breakout setups?',
  'Compare momentum across all stocks',
  'Which are oversold based on RSI?',
];

// Render AI response with basic formatting
function FormattedResponse({ text }) {
  const lines = text.split('\n');
  return (
    <div className="ai-message-content">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: '4px' }} />;
        if (/^[-•*]\s/.test(line)) {
          return <div key={i} className="ai-bullet">{renderInline(line.replace(/^[-•*]\s+/, ''))}</div>;
        }
        if (/^\d+\.\s/.test(line)) {
          return <div key={i} className="ai-bullet">{renderInline(line)}</div>;
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')  && part.endsWith('`'))  return <code key={i} style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

const AiPanel = ({ tickers, dateRange, selectedMetrics, isOpen, onToggle }) => {
  const [provider, setProvider] = useState('ollama');
  const [model, setModel]       = useState(DEFAULT_MODELS.ollama);
  const [apiKey, setApiKey]     = useState(() => localStorage.getItem('ai_key_ollama') || '');
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextStatus, setContextStatus] = useState('idle'); // idle | loading | loaded | error
  const [contextSummary, setContextSummary] = useState('');
  const [aiConfig, setAiConfig] = useState(null); // { production, provider, model, request_limit }
  const messagesEndRef = useRef(null);
  const cachedContextRef = useRef(null); // cache context per ticker set

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch AI config once on mount
  useEffect(() => {
    fetch('/ai/config')
      .then(r => r.json())
      .then(cfg => {
        setAiConfig(cfg);
        if (cfg.production && cfg.model) {
          setProvider('ollama');
          setModel(cfg.model);
        }
      })
      .catch(() => {});
  }, []);

  const isProduction = aiConfig?.production ?? false;

  const handleProviderChange = useCallback((newProvider) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider]);
    setApiKey(localStorage.getItem(`ai_key_${newProvider}`) || '');
  }, []);

  const handleApiKeyChange = useCallback((e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem(`ai_key_${provider}`, key);
  }, [provider]);

  const buildContextSummary = useCallback(async () => {
    const cacheKey = tickers.join(',');
    if (cachedContextRef.current?.key === cacheKey) {
      return cachedContextRef.current.summary;
    }

    setContextStatus('loading');
    const endDate   = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const metricsParam = [
      'Ticker_Close', 'Ticker_RSI', 'Ticker_MACD', 'Ticker_MACD_Signal',
      'Ticker_SMA_10', 'Ticker_SMA_30', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low',
      'Ticker_Williams_R', 'Ticker_On_Balance_Volume',
    ].join(',');

    // Cap at 25 tickers for performance; note the cap in the summary if exceeded
    const fetchTickers = tickers.length > 25 ? tickers.slice(0, 25) : tickers;
    const lines = await Promise.all(
      fetchTickers.map(async (ticker) => {
        try {
          const resp = await fetch(
            `/stock/${ticker}?start_date=${startDate}&end_date=${endDate}&metrics=${metricsParam}`
          );
          if (!resp.ok) return `${ticker}: unavailable`;
          const data = await resp.json();
          if (!data?.length) return `${ticker}: no recent data`;

          const d       = data[0]; // most recent (API returns desc)
          const close   = parseFloat(d.Ticker_Close || 0);
          const rsi     = parseFloat(d.Ticker_RSI || 0);
          const macd    = parseFloat(d.Ticker_MACD || 0);
          const sig     = parseFloat(d.Ticker_MACD_Signal || 0);
          const sma10   = parseFloat(d.Ticker_SMA_10 || 0);
          const sma30   = parseFloat(d.Ticker_SMA_30 || 0);
          const bbHigh  = parseFloat(d.Ticker_Bollinger_High || 0);
          const bbLow   = parseFloat(d.Ticker_Bollinger_Low || 0);
          const willR   = parseFloat(d.Ticker_Williams_R || 0);

          const trend  = sma10 > sma30  ? 'uptrend'  : 'downtrend';
          const macdS  = macd  > sig    ? 'MACD↑'    : 'MACD↓';
          let rsiState = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';
          let bbState  = close > bbHigh ? 'above-BB' : close < bbLow ? 'below-BB' : 'in-bands';
          let willState = willR > -20 ? 'overbought' : willR < -80 ? 'oversold' : 'neutral';

          return `${ticker}: $${close.toFixed(2)}, RSI=${rsi.toFixed(1)}(${rsiState}), ${macdS}, ${trend}, BB=${bbState}, WillR=${willR.toFixed(0)}(${willState})`;
        } catch {
          return `${ticker}: error`;
        }
      })
    );

    const capNote = tickers.length > 25 ? ` (showing top 25 of ${tickers.length})` : '';
    const summary = lines.join('\n') + (capNote ? `\n${capNote}` : '');
    cachedContextRef.current = { key: cacheKey, summary };
    setContextStatus('loaded');
    setContextSummary(`${fetchTickers.length} tickers loaded${capNote}`);
    return summary;
  }, [tickers]);

  // Pre-fetch context when panel opens
  useEffect(() => {
    if (isOpen && contextStatus === 'idle') {
      buildContextSummary().catch(() => setContextStatus('error'));
    }
  }, [isOpen, contextStatus, buildContextSummary]);

  // Reset context when tickers change
  useEffect(() => {
    cachedContextRef.current = null;
    setContextStatus('idle');
    setContextSummary('');
  }, [tickers]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setIsLoading(true);

    try {
      const dataSummary = await buildContextSummary();

      const resp = await fetch('/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          api_key: apiKey || undefined,
          message: msg,
          context: {
            tickers,
            dateRange: `${dateRange} days`,
            metrics: selectedMetrics,
            dataSummary,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        if (resp.status === 429) {
          throw new Error('Request limit reached (100 per IP). Try again later.');
        }
        throw new Error(err.detail || 'Request failed');
      }

      const data = await resp.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `**Error:** ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, provider, model, apiKey, tickers, dateRange, selectedMetrics, buildContextSummary]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-panel">
      {/* Header row */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">⚡ AI TERMINAL</div>
        <div className="ai-panel-controls">
          {isProduction ? (
            <span className="ai-model-fixed" title="Powered by local Ollama in production">
              {model}
            </span>
          ) : (
            <>
              <select className="ai-select" value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
                <option value="ollama">Ollama</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
              <input
                className="ai-model-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="model"
              />
              {provider !== 'ollama' && (
                <input
                  className="ai-key-input"
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="API key"
                />
              )}
            </>
          )}
          <button className="ai-close-btn" onClick={onToggle} aria-label="Close">✕</button>
        </div>
      </div>

      {/* Context status bar */}
      <div className="ai-context-bar">
        <span className={`ai-context-dot ${contextStatus === 'loading' ? 'loading' : contextStatus === 'loaded' ? 'loaded' : ''}`} />
        <span className="ai-context-text">
          {contextStatus === 'idle'    && `${tickers.length} tickers — ${dateRange}D view`}
          {contextStatus === 'loading' && 'Fetching live indicator data...'}
          {contextStatus === 'loaded'  && `Context: ${contextSummary} · ${dateRange}D`}
          {contextStatus === 'error'   && 'Context fetch failed — AI will use general knowledge'}
        </span>
        <span className="ai-model-badge">{model}</span>
        {messages.length > 0 && (
          <button className="ai-clear-btn" onClick={() => setMessages([])}>
            CLEAR
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-welcome">
            <p className="ai-welcome-text">
              Viewing <strong>{tickers.slice(0, 5).join(', ')}{tickers.length > 5 ? ` +${tickers.length - 5}` : ''}</strong>
            </p>
            <p className="ai-welcome-sub">
              Ask about signals, risk, momentum, or which stocks look interesting
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-message ai-message-${m.role}`}>
            <span className="ai-message-label">{m.role === 'user' ? 'YOU' : 'AI'}</span>
            {m.role === 'assistant'
              ? <FormattedResponse text={m.content} />
              : <span className="ai-message-content">{m.content}</span>
            }
          </div>
        ))}
        {isLoading && (
          <div className="ai-message ai-message-assistant">
            <span className="ai-message-label">AI</span>
            <span className="ai-thinking">analyzing indicators...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      <div className="ai-quick-actions">
        {QUICK_PROMPTS.map((prompt, i) => (
          <button key={i} className="ai-quick-btn" onClick={() => sendMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="ai-input-row">
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about patterns, signals, or find winners... (Enter to send)"
          rows={1}
        />
        <button
          className="ai-send-btn"
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
        >
          SEND
        </button>
      </div>
    </div>
  );
};

export default AiPanel;
