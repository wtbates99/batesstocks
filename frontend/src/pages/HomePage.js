

import React, { useState } from 'react';
import TickerSelector from '../components/TickerSelector';
import StockChart from '../components/StockChart';

const HomePage = () => {
  const [ticker, setTicker] = useState('');

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <h1 className="text-3xl text-white text-center mb-4">Stock Metrics</h1>
      <TickerSelector onSelect={setTicker} />
      {ticker && <StockChart ticker={ticker} />}
    </div>
  );
};

export default HomePage;
