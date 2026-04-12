import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../api/client'
import type { SearchResult } from '../api/types'

interface Props {
  placeholder?: string
  onSelect?: (ticker: string) => void
  autoFocus?: boolean
}

export default function SearchBar({ placeholder = 'Search ticker or company…', onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const resultsId = useId()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    const requestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(q.trim(), 10)
        if (requestId !== requestIdRef.current) return
        setResults(res)
        setOpen(res.length > 0)
        setActive(0)
      } catch {
        if (requestId !== requestIdRef.current) return
        setResults([])
        setOpen(false)
      }
    }, 150)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      requestIdRef.current += 1
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    search(v)
  }

  const handleSelect = (ticker: string) => {
    setQuery('')
    setResults([])
    setOpen(false)
    if (onSelect) {
      onSelect(ticker)
    } else {
      navigate(`/security/${ticker}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (results[active]) handleSelect(results[active].ticker) }
    if (e.key === 'Escape')    { setOpen(false); inputRef.current?.blur() }
  }

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="search-wrap">
      <Search size={12} className="search-icon" />
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Search securities"
        aria-expanded={open}
        aria-controls={resultsId}
        aria-activedescendant={open ? `${resultsId}-option-${active}` : undefined}
        role="combobox"
        spellCheck={false}
      />
      {open && (
        <div id={resultsId} className="search-dropdown" role="listbox">
          {results.map((r, i) => (
            <div
              key={r.ticker}
              id={`${resultsId}-option-${i}`}
              className={`search-item${i === active ? ' active' : ''}`}
              onMouseDown={() => handleSelect(r.ticker)}
              onMouseEnter={() => setActive(i)}
              role="option"
              aria-selected={i === active}
            >
              <span className="search-item-ticker">{r.ticker}</span>
              <span className="search-item-name">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
