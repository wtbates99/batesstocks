import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash/debounce';

const SearchBar = ({ autoFocus, onNavigate }) => {
  const [searchTerm, setSearchTerm]       = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeIndex, setActiveIndex]     = useState(-1);

  const navigate   = useNavigate();
  const cacheRef   = useRef({});
  const containerRef = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  // Stable debounced fetch — uses a ref for the cache so it never changes identity
  const debouncedSearch = useRef(
    debounce(async (term) => {
      if (!term) { setSearchResults([]); return; }
      if (cacheRef.current[term]) { setSearchResults(cacheRef.current[term]); return; }
      try {
        const res = await fetch(`/search?query=${encodeURIComponent(term)}&limit=10`);
        if (!res.ok) { setSearchResults([]); return; }
        const data = await res.json();
        cacheRef.current[term] = data;
        setSearchResults(data);
        setActiveIndex(-1);
      } catch {
        setSearchResults([]);
      }
    }, 150)
  ).current;

  const handleChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    debouncedSearch(e.target.value);
  }, [debouncedSearch]);

  const select = useCallback((ticker) => {
    setSearchTerm('');
    setSearchResults([]);
    setActiveIndex(-1);
    if (onNavigate) onNavigate();
    navigate(`/spotlight/${ticker}`);
  }, [navigate, onNavigate]);

  const handleKeyDown = useCallback((e) => {
    if (!searchResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(searchResults[activeIndex].ticker);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setActiveIndex(-1);
    }
  }, [searchResults, activeIndex, select]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSearchResults([]);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="search-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search companies..."
        value={searchTerm}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="search-input"
        autoComplete="off"
        spellCheck={false}
      />
      {searchResults.length > 0 && (
        <ul className="search-results">
          {searchResults.map((result, i) => (
            <li
              key={result.ticker}
              className={`search-result-item${i === activeIndex ? ' active' : ''}`}
              onMouseDown={() => select(result.ticker)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="search-result-ticker">{result.ticker}</span>
              <span className="search-result-name">{result.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
