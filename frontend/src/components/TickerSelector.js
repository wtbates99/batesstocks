
import React, { useState } from 'react';

const TickerSelector = ({ onSelect }) => {
  const [ticker, setTicker] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (ticker.trim()) {
      onSelect(ticker.trim().toUpperCase());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Enter Ticker"
        className="p-2 rounded w-full dark:bg-gray-700 dark:text-white"
      />
      <button type="submit" className="mt-2 p-2 bg-blue-500 text-white rounded">
        Search
      </button>
    </form>
  );
};

export default TickerSelector;
