import React, { useState, useEffect } from 'react';
import { fetchStocks } from '../services/api';

function StockList({ onSelectStock }) {
  const [stocks, setStocks] = useState([]);

  useEffect(() => {
    fetchStocks().then(setStocks);
  }, []);

  return (
    <>
      <h2 className="text-2xl font-semibold mb-4">Stock List</h2>
      <div className="h-[600px] overflow-y-auto">
        {stocks.map(stock => (
          <div
            key={stock.Ticker}
            className="p-4 border-b cursor-pointer hover:bg-gray-100"
            onClick={() => onSelectStock(stock.Ticker)}
          >
            <h3 className="font-bold">{stock.Ticker}</h3>
            <p>{stock.FullName}</p>
            <p className="text-sm text-gray-600">{stock.Sector} - {stock.Subsector}</p>
            <p className="text-sm">Market Cap: {stock.MarketCap}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default StockList;
