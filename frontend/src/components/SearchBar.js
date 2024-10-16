import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash/debounce';

const SearchBar = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchCache, setSearchCache] = useState({});
  const navigate = useNavigate();

  const debouncedSearch = useMemo(
    () =>
      debounce(async (term) => {
        if (term.length > 0) {
          if (searchCache[term]) {
            setSearchResults(searchCache[term]);
          } else {
            try {
              const response = await fetch(`/search?query=${encodeURIComponent(term)}`);
              if (response.ok) {
                const data = await response.json();
                setSearchResults(data);
                setSearchCache(prev => ({ ...prev, [term]: data }));
              } else {
                console.error('Search request failed');
                setSearchResults([]);
              }
            } catch (error) {
              console.error('Error during search:', error);
              setSearchResults([]);
            }
          }
        } else {
          setSearchResults([]);
        }
      }, 150),
    [searchCache]
  );

  const handleSearch = useCallback((event) => {
    const term = event.target.value;
    setSearchTerm(term);
    debouncedSearch(term);
  }, [debouncedSearch]);

  const handleSearchResultClick = useCallback((ticker) => {
    setSearchTerm('');
    setSearchResults([]);
    navigate(`/spotlight/${ticker}`);
  }, [navigate]);

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="Search companies..."
        value={searchTerm}
        onChange={handleSearch}
        className="search-input"
      />
      {searchResults.length > 0 && (
        <ul className="search-results">
          {searchResults.map((result) => (
            <li
              key={result.ticker}
              onClick={() => handleSearchResultClick(result.ticker)}
              className="search-result-item"
            >
              {result.name} ({result.ticker})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
