import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { debounce } from 'lodash';

const API_BASE_URL = 'http://localhost:8000';

const StockDashboard = () => {
  const [ticker, setTicker] = useState('');
  const [stockData, setStockData] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStockData = useCallback(
    debounce(async (ticker) => {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/stock/${ticker}`);
        if (!response.ok) throw new Error('Failed to fetch stock data');
        const data = await response.json();
        setStockData(data.items);

        const companyResponse = await fetch(`${API_BASE_URL}/company/${ticker}`);
        if (!companyResponse.ok) throw new Error('Failed to fetch company info');
        const companyData = await companyResponse.json();
        setCompanyInfo(companyData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    if (ticker) {
      fetchStockData(ticker);
    }
  }, [ticker, fetchStockData]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Stock Dashboard</h1>
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        placeholder="Enter stock ticker"
        className="border p-2 mb-4"
      />
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {companyInfo && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold">{companyInfo.FullName} ({companyInfo.Ticker})</h2>
          <p>Sector: {companyInfo.Sector}</p>
          <p>Market Cap: {companyInfo.MarketCap}</p>
          <p>Current Price: ${companyInfo.Price}</p>
        </div>
      )}
      {stockData.length > 0 && (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={stockData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="Date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Close" stroke="#8884d8" />
            <Line type="monotone" dataKey="SMA_10" stroke="#82ca9d" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default StockDashboard;
