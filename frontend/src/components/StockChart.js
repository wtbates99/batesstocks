import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchStockData } from '../services/api';
import InfoCard from './InfoCard';

function StockChart({ selectedStock }) {
  const [stockData, setStockData] = useState([]);

  useEffect(() => {
    if (selectedStock) {
      fetchStockData(selectedStock).then(data => setStockData(data.reverse()));
    }
  }, [selectedStock]);

  if (!selectedStock) {
    return <p>Select a stock to view its data</p>;
  }

  return (
    <>
      <h2 className="text-2xl font-semibold mb-4">Stock Data</h2>
      <h3 className="text-xl mb-4">{selectedStock}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={stockData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Ticker_Close" stroke="#8884d8" />
          <Line type="monotone" dataKey="Ticker_SMA_10" stroke="#82ca9d" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard title="RSI" value={stockData[0]?.Ticker_RSI.toFixed(2)} />
        <InfoCard title="MACD" value={stockData[0]?.Ticker_MACD.toFixed(2)} />
        <InfoCard title="Stochastic K" value={stockData[0]?.Ticker_Stochastic_K.toFixed(2)} />
        <InfoCard title="Stochastic D" value={stockData[0]?.Ticker_Stochastic_D.toFixed(2)} />
      </div>
    </>
  );
}

export default StockChart;
